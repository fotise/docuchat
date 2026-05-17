import type {
  GraphEdgeType,
  GraphEntityType,
  StoredDocumentChunk,
  StoredGraphEdge,
  StoredGraphEntity,
} from "@/lib/chat-history/indexed-db"
import type { GeneratedEmbedding } from "./embeddings"

interface DocumentGraph {
  edges: StoredGraphEdge[]
  entities: StoredGraphEntity[]
}

export interface LlmGraphEntity {
  aliases?: string[]
  confidence?: number
  name: string
  type?: GraphEntityType
}

export interface LlmGraphRelation {
  confidence?: number
  evidence?: string
  source: string
  target: string
  type?: GraphEdgeType
}

export interface LlmGraphExtractionResult {
  entities?: LlmGraphEntity[]
  relations?: LlmGraphRelation[]
}

interface BuildDocumentGraphOptions {
  llmExtraction?: LlmGraphExtractionResult
}

const MAX_ENTITIES_PER_CHUNK = 8
const MAX_ENTITY_NAME_LENGTH = 64
const TOPIC_STOP_WORDS = new Set([
  "about",
  "analysis",
  "based",
  "between",
  "chapter",
  "context",
  "data",
  "document",
  "file",
  "from",
  "market",
  "overview",
  "page",
  "report",
  "section",
  "summary",
  "table",
  "that",
  "their",
  "there",
  "these",
  "this",
  "with",
])

function normalizeEntityName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function createSafeId(value: string) {
  return normalizeEntityName(value).replace(/\s+/g, "-") || "entity"
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function inferEntityType(name: string): GraphEntityType {
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{4}$|\b(q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(name)) {
    return "date"
  }

  if (/%|\b(kpi|revenue|growth|score|rate|margin|retention|churn|sales)\b/i.test(name)) {
    return "metric"
  }

  if (/\b(inc|llc|ltd|corp|company|group|partners|bank|university)\b/i.test(name)) {
    return "organization"
  }

  if (/\b(risk|clause|contract|liability|termination|indemnification)\b/i.test(name)) {
    return "topic"
  }

  return "topic"
}

function extractCapitalizedEntities(text: string) {
  const matches = text.match(/\b[A-Z][A-Za-z0-9&'’-]*(?:\s+[A-Z][A-Za-z0-9&'’-]*){0,4}\b/g) ?? []

  return matches.filter((match) => {
    const normalized = normalizeEntityName(match)

    return normalized.length > 2
      && normalized.length <= MAX_ENTITY_NAME_LENGTH
      && !TOPIC_STOP_WORDS.has(normalized)
  })
}

function extractMetricEntities(text: string) {
  const matches = text.match(/\b\d+(?:[.,]\d+)?\s?(?:%|k|m|b|x|usd|eur|gbp|days|months|years)\b/gi) ?? []

  return matches.map((match) => match.trim())
}

function extractDateEntities(text: string) {
  const matches = text.match(/\b(?:20\d{2}|19\d{2}|Q[1-4]\s+20\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2})\b/gi) ?? []

  return matches.map((match) => match.trim())
}

function extractTopicEntities(text: string) {
  const matches = text.match(/\b(?:customer health|customer retention|retention|churn|market trend|competitor|contract risk|liability|termination|indemnification|growth|revenue|survey|vendor|budget)\b/gi) ?? []

  return matches.map((match) => match.trim())
}

function extractEntityNames(text: string) {
  return uniqueValues([
    ...extractCapitalizedEntities(text),
    ...extractMetricEntities(text),
    ...extractDateEntities(text),
    ...extractTopicEntities(text),
  ]).slice(0, MAX_ENTITIES_PER_CHUNK)
}

function createEvidenceText(text: string) {
  return text.length > 220 ? `${text.slice(0, 220)}…` : text
}

function createEdgeId(workspaceId: string, documentId: string, leftId: string, rightId: string, type: GraphEdgeType) {
  return `${workspaceId}:${documentId}:edge:${type}:${leftId}:${rightId}`
}

function findFirstChildMention(chunks: StoredDocumentChunk[], names: string[]) {
  const normalizedNames = names.map(normalizeEntityName).filter(Boolean)

  return chunks.find((chunk) => {
    if (chunk.level !== "child") {
      return false
    }

    const normalizedText = normalizeEntityName(chunk.text)

    return normalizedNames.some((name) => normalizedText.includes(name))
  })
}

function ensureLlmEntity(
  workspaceId: string,
  documentId: string,
  chunks: StoredDocumentChunk[],
  entityByName: Map<string, StoredGraphEntity>,
  entity: LlmGraphEntity,
  now: number
) {
  const normalizedName = normalizeEntityName(entity.name)

  if (!normalizedName) {
    return undefined
  }

  const aliases = uniqueValues([entity.name, ...(entity.aliases ?? [])])
  const existingEntity = entityByName.get(normalizedName)
  const mentionChunk = findFirstChildMention(chunks, aliases)
  const mention = mentionChunk
    ? {
        documentId,
        chunkId: mentionChunk.chunkId,
        parentChunkId: mentionChunk.parentChunkId,
        pageNumbers: mentionChunk.pageNumbers,
        text: createEvidenceText(mentionChunk.text),
      }
    : undefined

  if (existingEntity) {
    existingEntity.aliases = uniqueValues([...existingEntity.aliases, ...aliases])
    existingEntity.confidence = Math.max(existingEntity.confidence, entity.confidence ?? 0.7)
    existingEntity.type = entity.type ?? existingEntity.type
    existingEntity.updatedAt = now

    if (mention) {
      existingEntity.mentions.push(mention)
    }

    return existingEntity
  }

  const createdEntity: StoredGraphEntity = {
    id: `${workspaceId}:${documentId}:entity:${createSafeId(normalizedName)}`,
    workspaceId,
    documentId,
    name: entity.name,
    normalizedName,
    type: entity.type ?? inferEntityType(entity.name),
    aliases,
    mentions: mention ? [mention] : [],
    confidence: entity.confidence ?? 0.7,
    createdAt: now,
    updatedAt: now,
  }

  entityByName.set(normalizedName, createdEntity)
  return createdEntity
}

function mergeLlmExtraction(
  workspaceId: string,
  documentId: string,
  chunks: StoredDocumentChunk[],
  entityByName: Map<string, StoredGraphEntity>,
  edgeByPair: Map<string, StoredGraphEdge>,
  extraction: LlmGraphExtractionResult | undefined,
  now: number
) {
  if (!extraction) {
    return
  }

  for (const entity of extraction.entities ?? []) {
    ensureLlmEntity(workspaceId, documentId, chunks, entityByName, entity, now)
  }

  for (const relation of extraction.relations ?? []) {
    const sourceEntity = ensureLlmEntity(
      workspaceId,
      documentId,
      chunks,
      entityByName,
      { name: relation.source },
      now
    )
    const targetEntity = ensureLlmEntity(
      workspaceId,
      documentId,
      chunks,
      entityByName,
      { name: relation.target },
      now
    )

    if (!sourceEntity || !targetEntity) {
      continue
    }

    const edgeType = relation.type ?? "related_to"
    const edgeId = createEdgeId(
      workspaceId,
      documentId,
      sourceEntity.id,
      targetEntity.id,
      edgeType
    )
    const evidenceText = relation.evidence
      ? createEvidenceText(relation.evidence)
      : sourceEntity.mentions[0]?.text ?? targetEntity.mentions[0]?.text ?? "LLM extracted relation"
    const chunkIds = uniqueValues([
      sourceEntity.mentions[0]?.chunkId,
      targetEntity.mentions[0]?.chunkId,
    ].filter((value): value is string => Boolean(value)))

    edgeByPair.set(edgeId, {
      id: edgeId,
      workspaceId,
      sourceEntityId: sourceEntity.id,
      targetEntityId: targetEntity.id,
      type: edgeType,
      documentIds: [documentId],
      chunkIds,
      weight: 2,
      evidenceText: [evidenceText],
      confidence: relation.confidence ?? 0.72,
      createdAt: now,
      updatedAt: now,
    })
  }
}

export function buildDocumentGraph(
  workspaceId: string,
  documentId: string,
  chunks: StoredDocumentChunk[],
  options: BuildDocumentGraphOptions = {}
): DocumentGraph {
  const now = Date.now()
  const childChunks = chunks.filter((chunk) => chunk.level === "child")
  const entityByName = new Map<string, StoredGraphEntity>()
  const edgeByPair = new Map<string, StoredGraphEdge>()

  for (const chunk of childChunks) {
    const names = extractEntityNames(chunk.text)
    const chunkEntityIds: string[] = []

    for (const name of names) {
      const normalizedName = normalizeEntityName(name)

      if (!normalizedName) {
        continue
      }

      const id = `${workspaceId}:${documentId}:entity:${createSafeId(normalizedName)}`
      const mention = {
        documentId,
        chunkId: chunk.chunkId,
        parentChunkId: chunk.parentChunkId,
        pageNumbers: chunk.pageNumbers,
        text: createEvidenceText(chunk.text),
      }
      const existingEntity = entityByName.get(normalizedName)

      if (existingEntity) {
        existingEntity.aliases = uniqueValues([...existingEntity.aliases, name])
        existingEntity.mentions.push(mention)
        existingEntity.confidence = Math.min(1, existingEntity.confidence + 0.08)
        existingEntity.updatedAt = now
      } else {
        entityByName.set(normalizedName, {
          id,
          workspaceId,
          documentId,
          name,
          normalizedName,
          type: inferEntityType(name),
          aliases: [name],
          mentions: [mention],
          confidence: 0.55,
          createdAt: now,
          updatedAt: now,
        })
      }

      chunkEntityIds.push(id)
    }

    const uniqueChunkEntityIds = uniqueValues(chunkEntityIds).sort()

    for (let leftIndex = 0; leftIndex < uniqueChunkEntityIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < uniqueChunkEntityIds.length; rightIndex += 1) {
        const sourceEntityId = uniqueChunkEntityIds[leftIndex]
        const targetEntityId = uniqueChunkEntityIds[rightIndex]
        const edgeId = createEdgeId(
          workspaceId,
          documentId,
          sourceEntityId,
          targetEntityId,
          "co_occurs_with"
        )
        const existingEdge = edgeByPair.get(edgeId)

        if (existingEdge) {
          existingEdge.chunkIds = uniqueValues([...existingEdge.chunkIds, chunk.chunkId])
          existingEdge.documentIds = uniqueValues([...existingEdge.documentIds, documentId])
          existingEdge.evidenceText = uniqueValues([
            ...existingEdge.evidenceText,
            createEvidenceText(chunk.text),
          ]).slice(0, 5)
          existingEdge.weight += 1
          existingEdge.confidence = Math.min(1, existingEdge.confidence + 0.08)
          existingEdge.updatedAt = now
        } else {
          edgeByPair.set(edgeId, {
            id: edgeId,
            workspaceId,
            sourceEntityId,
            targetEntityId,
            type: "co_occurs_with",
            documentIds: [documentId],
            chunkIds: [chunk.chunkId],
            weight: 1,
            evidenceText: [createEvidenceText(chunk.text)],
            confidence: 0.6,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }
  }

  mergeLlmExtraction(
    workspaceId,
    documentId,
    chunks,
    entityByName,
    edgeByPair,
    options.llmExtraction,
    now
  )

  return {
    edges: Array.from(edgeByPair.values()),
    entities: Array.from(entityByName.values()),
  }
}

export function applyGraphEntityEmbeddings(
  graph: DocumentGraph,
  embeddings: GeneratedEmbedding[]
): DocumentGraph {
  return {
    ...graph,
    entities: graph.entities.map((entity, index) => {
      const embedding = embeddings[index]

      return embedding
        ? {
            ...entity,
            embedding: embedding.embedding,
            embeddingDimensions: embedding.dimensions,
            embeddingModel: embedding.model,
          }
        : entity
    }),
  }
}
