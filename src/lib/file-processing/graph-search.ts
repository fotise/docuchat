import {
  getWorkspaceDocumentChunks,
  getWorkspaceDocuments,
  getWorkspaceGraphEdges,
  getWorkspaceGraphEntities,
  type StoredDocumentChunk,
  type StoredGraphEdge,
  type StoredGraphEntity,
  type StoredWorkspaceDocument,
} from "@/lib/chat-history/indexed-db"
import type { RetrievedContextChunk } from "@/lib/llm/types"
import { UndirectedGraph } from "graphology"
import { cosineSimilarity } from "./semantic-search"
import { generateEmbeddings, type GeneratedEmbedding } from "./embeddings"

interface GraphSearchOptions {
  depth?: number
  entityQueries?: string[]
  generateEmbeddings?: (texts: string[]) => Promise<GeneratedEmbedding[]>
  getChunks?: (workspaceId: string) => Promise<StoredDocumentChunk[]>
  getDocuments?: (workspaceId: string) => Promise<StoredWorkspaceDocument[]>
  getEdges?: (workspaceId: string) => Promise<StoredGraphEdge[]>
  getEntities?: (workspaceId: string) => Promise<StoredGraphEntity[]>
  limit?: number
  targetDocumentNames?: string[]
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
  "between",
  "che",
  "con",
  "dei",
  "del",
  "della",
  "for",
  "gli",
  "how",
  "main",
  "nel",
  "per",
  "related",
  "relationship",
  "steps",
  "the",
  "what",
])

const GENERIC_SINGLE_TOKEN_ENTITIES = new Set([
  "document",
  "documents",
  "input",
  "inputs",
  "list",
  "output",
  "outputs",
  "process",
  "requirements",
  "table",
])

function normalizeGraphText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function normalizeFileName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function stripFileExtension(value: string) {
  return value.replace(/\.[a-z0-9]{1,8}$/i, "")
}

function matchesTargetDocument(document: StoredWorkspaceDocument, targets: string[]) {
  if (targets.length === 0) {
    return false
  }

  const normalizedName = normalizeFileName(document.name)
  const normalizedBaseName = stripFileExtension(normalizedName)

  return targets.some((target) => {
    const normalizedTarget = normalizeFileName(target)
    const normalizedTargetBaseName = stripFileExtension(normalizedTarget)

    return normalizedName === normalizedTarget
      || normalizedBaseName === normalizedTarget
      || normalizedBaseName === normalizedTargetBaseName
  })
}

async function resolveTargetDocumentIds(workspaceId: string, options: GraphSearchOptions) {
  const normalizedTargets = (options.targetDocumentNames ?? [])
    .map((target) => target.trim())
    .filter(Boolean)

  if (normalizedTargets.length === 0) {
    return undefined
  }

  const documents = await (options.getDocuments ?? getWorkspaceDocuments)(workspaceId)

  return new Set(
    documents
      .filter((document) => matchesTargetDocument(document, normalizedTargets))
      .map((document) => document.id)
  )
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

  const queryPhrase = queryTokens.join(" ")
  const exactName = names.find((name) => {
    const nameTokens = Array.from(new Set(tokenize(name)))

    if (nameTokens.length === 0) {
      return false
    }

    return name === queryPhrase
      || queryPhrase === name
      || (nameTokens.length > 1 && (queryPhrase.includes(name) || name.includes(queryPhrase)))
  })

  if (exactName) {
    return 1
  }

  const matchedTokens = queryTokens.filter((token) => names.some((name) => {
    const nameTokens = tokenize(name)

    if (nameTokens.length === 1 && GENERIC_SINGLE_TOKEN_ENTITIES.has(nameTokens[0]) && queryTokens.length > 1) {
      return false
    }

    return nameTokens.includes(token)
  }))

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

function buildChunkLookup(chunks: StoredDocumentChunk[]) {
  return new Map(chunks.map((chunk) => [chunk.chunkId, chunk]))
}

function buildGraphologyIndex(
  entities: StoredGraphEntity[],
  edges: StoredGraphEdge[]
) {
  const graph = new UndirectedGraph()
  const edgeByKey = new Map<string, StoredGraphEdge>()
  const entityById = new Map(entities.map((entity) => [entity.id, entity]))

  for (const entity of entities) {
    graph.mergeNode(entity.id, {
      confidence: entity.confidence,
      mentionCount: entity.mentions.length,
      name: entity.name,
      type: entity.type,
    })
  }

  for (const edge of edges) {
    if (!entityById.has(edge.sourceEntityId) || !entityById.has(edge.targetEntityId)) {
      continue
    }

    const canonicalEdgeId = [edge.sourceEntityId, edge.targetEntityId]
      .sort()
      .join("::")
    const existingEdge = edgeByKey.get(canonicalEdgeId)

    if (existingEdge && existingEdge.confidence >= edge.confidence) {
      continue
    }

    graph.mergeUndirectedEdgeWithKey(canonicalEdgeId, edge.sourceEntityId, edge.targetEntityId, {
      confidence: edge.confidence,
      type: edge.type,
      weight: edge.weight,
    })
    edgeByKey.set(canonicalEdgeId, edge)
  }

  const maxDegree = Math.max(1, ...graph.nodes().map((node) => graph.degree(node)))

  return { edgeByKey, entityById, graph, maxDegree }
}

function getCentralityBoost(graph: UndirectedGraph, entityId: string, maxDegree: number) {
  return Math.min(0.15, (graph.degree(entityId) / maxDegree) * 0.15)
}

function traverseRelatedEntities(
  rootEntity: StoredGraphEntity,
  graph: UndirectedGraph,
  entityById: Map<string, StoredGraphEntity>,
  edgeByKey: Map<string, StoredGraphEdge>,
  maxDegree: number,
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

    for (const relatedEntityId of graph.neighbors(current.entityId)) {
      const relatedEntity = entityById.get(relatedEntityId)

      if (!relatedEntity || visited.has(relatedEntity.id)) {
        continue
      }

      const edgeKey = graph.undirectedEdges(current.entityId, relatedEntityId)[0]
      const edge = edgeKey ? edgeByKey.get(edgeKey) : undefined

      if (!edge) {
        continue
      }

      const edgeScore = Math.min(1, edge.confidence * 0.5 + Math.min(edge.weight / 5, 1) * 0.5)
      const centralityBoost = getCentralityBoost(graph, relatedEntity.id, maxDegree)
      const score = Math.min(1, current.pathScore * edgeScore * (1 / (current.depth + 1)) + centralityBoost)
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
  const [entities, edges, targetDocumentIds] = await Promise.all([
    (options.getEntities ?? getWorkspaceGraphEntities)(workspaceId),
    (options.getEdges ?? getWorkspaceGraphEdges)(workspaceId),
    resolveTargetDocumentIds(workspaceId, options),
  ])
  const filteredEntities = targetDocumentIds
    ? entities.filter((entity) => entity.documentId ? targetDocumentIds.has(entity.documentId) : false)
    : entities
  const filteredEntityIds = new Set(filteredEntities.map((entity) => entity.id))
  const filteredEdges = targetDocumentIds
    ? edges.filter((edge) =>
        edge.documentIds.some((documentId) => targetDocumentIds.has(documentId))
        && filteredEntityIds.has(edge.sourceEntityId)
        && filteredEntityIds.has(edge.targetEntityId)
      )
    : edges

  if (targetDocumentIds?.size === 0 || filteredEntities.length === 0) {
    return []
  }

  const queries = [query, ...(options.entityQueries ?? [])].map((item) => item.trim()).filter(Boolean)
  const graphIndex = buildGraphologyIndex(filteredEntities, filteredEdges)
  const embeddingScores = await scoreEntitiesWithEmbeddings(queries, filteredEntities, options)

  return filteredEntities
    .map((entity) => {
      const lexicalScore = Math.max(...queries.map((item) => scoreEntity(item, entity)), 0)
      const embeddingScore = embeddingScores.get(entity.id) ?? 0
      const centralityBoost = getCentralityBoost(graphIndex.graph, entity.id, graphIndex.maxDegree)
      const bestScore = Math.min(1, lexicalScore * 0.55 + Math.max(0, embeddingScore) * 0.35 + centralityBoost)
      const relatedEntities = traverseRelatedEntities(
        entity,
        graphIndex.graph,
        graphIndex.entityById,
        graphIndex.edgeByKey,
        graphIndex.maxDegree,
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
  const [allChunks, targetDocumentIds, graphResults] = await Promise.all([
    (options.getChunks ?? getWorkspaceDocumentChunks)(workspaceId),
    resolveTargetDocumentIds(workspaceId, options),
    graphSearchWorkspace(workspaceId, query, options),
  ])
  const chunks = targetDocumentIds
    ? allChunks.filter((chunk) => targetDocumentIds.has(chunk.documentId))
    : allChunks

  if (targetDocumentIds?.size === 0) {
    return []
  }

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
