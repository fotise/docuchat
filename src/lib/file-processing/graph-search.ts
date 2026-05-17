import {
  getWorkspaceDocumentChunks,
  getWorkspaceGraphEdges,
  getWorkspaceGraphEntities,
  type StoredDocumentChunk,
  type StoredGraphEdge,
  type StoredGraphEntity,
} from "@/lib/chat-history/indexed-db"
import type { RetrievedContextChunk } from "@/lib/llm/types"
import { cosineSimilarity } from "./semantic-search"
import { generateEmbeddings, type GeneratedEmbedding } from "./embeddings"

interface GraphSearchOptions {
  depth?: number
  entityQueries?: string[]
  generateEmbeddings?: (texts: string[]) => Promise<GeneratedEmbedding[]>
  getChunks?: (workspaceId: string) => Promise<StoredDocumentChunk[]>
  getEdges?: (workspaceId: string) => Promise<StoredGraphEdge[]>
  getEntities?: (workspaceId: string) => Promise<StoredGraphEntity[]>
  limit?: number
}

export interface GraphSearchResult {
  entity: StoredGraphEntity
  score: number
  matchedName: string
  relatedEntities: Array<{
    depth: number
    edge: StoredGraphEdge
    entity: StoredGraphEntity
    score: number
  }>
}

const STOP_WORDS = new Set([
  "and",
  "che",
  "con",
  "dei",
  "del",
  "della",
  "for",
  "gli",
  "how",
  "nel",
  "per",
  "the",
  "what",
])

function normalizeGraphText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function tokenize(value: string) {
  return normalizeGraphText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
}

function scoreEntity(query: string, entity: StoredGraphEntity) {
  const queryTokens = Array.from(new Set(tokenize(query)))
  const names = [entity.name, entity.normalizedName, ...entity.aliases].map(normalizeGraphText)

  if (queryTokens.length === 0) {
    return 0
  }

  const exactName = names.find((name) => queryTokens.join(" ").includes(name) || name.includes(queryTokens.join(" ")))

  if (exactName) {
    return 1
  }

  const matchedTokens = queryTokens.filter((token) => names.some((name) => name.includes(token)))

  return matchedTokens.length / queryTokens.length
}

async function scoreEntitiesWithEmbeddings(
  queries: string[],
  entities: StoredGraphEntity[],
  options: GraphSearchOptions
) {
  if (!entities.some((entity) => entity.embedding && entity.embedding.length > 0)) {
    return new Map<string, number>()
  }

  const [queryEmbedding] = await (options.generateEmbeddings ?? generateEmbeddings)([
    queries.join("\n"),
  ])

  if (!queryEmbedding?.embedding.length) {
    return new Map<string, number>()
  }

  return new Map(
    entities.map((entity) => [
      entity.id,
      entity.embedding ? cosineSimilarity(queryEmbedding.embedding, entity.embedding) : 0,
    ])
  )
}

function getOppositeEntityId(edge: StoredGraphEdge, entityId: string) {
  if (edge.sourceEntityId === entityId) {
    return edge.targetEntityId
  }

  if (edge.targetEntityId === entityId) {
    return edge.sourceEntityId
  }

  return undefined
}

function buildChunkLookup(chunks: StoredDocumentChunk[]) {
  return new Map(chunks.map((chunk) => [chunk.chunkId, chunk]))
}

function traverseRelatedEntities(
  rootEntity: StoredGraphEntity,
  entityById: Map<string, StoredGraphEntity>,
  edgesByEntityId: Map<string, StoredGraphEdge[]>,
  maxDepth: number
) {
  const related: GraphSearchResult["relatedEntities"] = []
  const visited = new Set([rootEntity.id])
  const queue: Array<{ depth: number; entityId: string; pathScore: number }> = [
    { depth: 0, entityId: rootEntity.id, pathScore: 1 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || current.depth >= maxDepth) {
      continue
    }

    for (const edge of edgesByEntityId.get(current.entityId) ?? []) {
      const relatedEntityId = getOppositeEntityId(edge, current.entityId)
      const relatedEntity = relatedEntityId ? entityById.get(relatedEntityId) : undefined

      if (!relatedEntity || visited.has(relatedEntity.id)) {
        continue
      }

      const edgeScore = Math.min(1, edge.confidence * 0.5 + Math.min(edge.weight / 5, 1) * 0.5)
      const score = current.pathScore * edgeScore * (1 / (current.depth + 1))
      const nextDepth = current.depth + 1

      visited.add(relatedEntity.id)
      related.push({
        depth: nextDepth,
        edge,
        entity: relatedEntity,
        score,
      })
      queue.push({
        depth: nextDepth,
        entityId: relatedEntity.id,
        pathScore: score,
      })
    }
  }

  return related.sort((left, right) => right.score - left.score)
}

function getParentChunk(chunk: StoredDocumentChunk, chunkById: Map<string, StoredDocumentChunk>) {
  if (chunk.level === "parent") {
    return chunk
  }

  return chunk.parentChunkId ? chunkById.get(chunk.parentChunkId) : undefined
}

function mergeGraphChunk(
  chunkById: Map<string, StoredDocumentChunk>,
  resultByParentId: Map<string, RetrievedContextChunk>,
  entity: StoredGraphEntity,
  score: number,
  edge?: StoredGraphEdge,
  relatedEntity?: StoredGraphEntity
) {
  const graphEntityNames = [entity.name, relatedEntity?.name].filter((name): name is string => Boolean(name))
  const graphEdgeTypes = edge ? [edge.type] : []
  const embeddingDimensions = Math.max(
    entity.embeddingDimensions ?? 0,
    relatedEntity?.embeddingDimensions ?? 0
  ) || undefined
  const mentions = edge
    ? entity.mentions.filter((mention) => edge.chunkIds.includes(mention.chunkId))
    : entity.mentions
  const mentionCandidates = mentions.length > 0 ? mentions : entity.mentions

  for (const mention of mentionCandidates) {
    const childChunk = chunkById.get(mention.chunkId)

    if (!childChunk) {
      continue
    }

    const parentChunk = getParentChunk(childChunk, chunkById)

    if (!parentChunk) {
      continue
    }

    const existing = resultByParentId.get(parentChunk.chunkId)

    if (existing) {
      existing.score = Math.max(existing.score, score)
      existing.similarity = Math.max(existing.similarity, score)
      existing.retrievalSource = existing.retrievalSource === "semantic" ? "hybrid" : "graph"
      existing.graphEntityNames = Array.from(new Set([...(existing.graphEntityNames ?? []), ...graphEntityNames]))
      existing.graphEdgeTypes = Array.from(new Set([...(existing.graphEdgeTypes ?? []), ...graphEdgeTypes]))
      existing.keywordScore = Math.max(existing.keywordScore ?? 0, embeddingDimensions ? 1 : 0)

      if (!existing.matchedChildChunkIds.includes(childChunk.chunkId)) {
        existing.matchedChildChunkIds.push(childChunk.chunkId)
      }

      continue
    }

    resultByParentId.set(parentChunk.chunkId, {
      documentId: parentChunk.documentId,
      graphEdgeTypes,
      graphEntityNames,
      matchedChildChunkIds: [childChunk.chunkId],
      matchedQueries: [entity.name],
      pageNumbers: parentChunk.pageNumbers,
      parentChunkId: parentChunk.chunkId,
      retrievalSource: "graph",
      score,
      similarity: score,
      text: parentChunk.text,
      excerpt: mention.text,
      keywordScore: embeddingDimensions ? 1 : undefined,
    })
  }
}

export async function graphSearchWorkspace(
  workspaceId: string,
  query: string,
  options: GraphSearchOptions = {}
): Promise<GraphSearchResult[]> {
  const [entities, edges] = await Promise.all([
    (options.getEntities ?? getWorkspaceGraphEntities)(workspaceId),
    (options.getEdges ?? getWorkspaceGraphEdges)(workspaceId),
  ])
  const queries = [query, ...(options.entityQueries ?? [])].map((item) => item.trim()).filter(Boolean)
  const entityById = new Map(entities.map((entity) => [entity.id, entity]))
  const edgesByEntityId = new Map<string, StoredGraphEdge[]>()
  const embeddingScores = await scoreEntitiesWithEmbeddings(queries, entities, options)

  for (const edge of edges) {
    edgesByEntityId.set(edge.sourceEntityId, [
      ...(edgesByEntityId.get(edge.sourceEntityId) ?? []),
      edge,
    ])
    edgesByEntityId.set(edge.targetEntityId, [
      ...(edgesByEntityId.get(edge.targetEntityId) ?? []),
      edge,
    ])
  }

  return entities
    .map((entity) => {
      const lexicalScore = Math.max(...queries.map((item) => scoreEntity(item, entity)), 0)
      const embeddingScore = embeddingScores.get(entity.id) ?? 0
      const bestScore = Math.min(1, lexicalScore * 0.65 + Math.max(0, embeddingScore) * 0.35)
      const relatedEntities = traverseRelatedEntities(
        entity,
        entityById,
        edgesByEntityId,
        options.depth ?? 1
      )

      return {
        entity,
        matchedName: entity.name,
        relatedEntities,
        score: bestScore,
      }
    })
    .filter((result) => result.score >= 0.25)
    .sort((left, right) => right.score - left.score)
    .slice(0, options.limit ?? 10)
}

export async function retrieveGraphContextForWorkspace(
  workspaceId: string,
  query: string,
  options: GraphSearchOptions = {}
): Promise<RetrievedContextChunk[]> {
  const [chunks, graphResults] = await Promise.all([
    (options.getChunks ?? getWorkspaceDocumentChunks)(workspaceId),
    graphSearchWorkspace(workspaceId, query, options),
  ])
  const chunkById = buildChunkLookup(chunks)
  const resultByParentId = new Map<string, RetrievedContextChunk>()

  for (const result of graphResults) {
    mergeGraphChunk(chunkById, resultByParentId, result.entity, result.score)

    for (const related of result.relatedEntities) {
      mergeGraphChunk(
        chunkById,
        resultByParentId,
        result.entity,
        Math.max(result.score, related.score),
        related.edge,
        related.entity
      )
    }
  }

  return Array.from(resultByParentId.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, options.limit ?? 10)
}
