import {
  getWorkspaceDocuments,
  getWorkspaceDocumentChunks,
  type StoredDocumentChunk,
  type StoredWorkspaceDocument,
} from "@/lib/chat-history/indexed-db"
import type { RetrievedContextChunk } from "@/lib/llm/types"
import { generateEmbeddings, type GeneratedEmbedding } from "./embeddings"

export interface SemanticSearchResult {
  chunk: StoredDocumentChunk
  document?: StoredWorkspaceDocument
  similarity: number
  score: number
}

interface SemanticSearchOptions {
  generateEmbeddings?: (texts: string[]) => Promise<GeneratedEmbedding[]>
  getChunks?: (workspaceId: string) => Promise<StoredDocumentChunk[]>
  getDocuments?: (workspaceId: string) => Promise<StoredWorkspaceDocument[]>
  limit?: number
  minSimilarity?: number
}

interface RetrieveParentChunksOptions extends SemanticSearchOptions {
  additionalQueries?: string[]
  parentLimit?: number
}

export const DEFAULT_MIN_SEMANTIC_SIMILARITY = 0.3

export function cosineSimilarity(left: number[], right: number[]) {
  const dimensions = Math.min(left.length, right.length)

  if (dimensions === 0) {
    return 0
  }

  let dotProduct = 0
  let leftMagnitude = 0
  let rightMagnitude = 0

  for (let index = 0; index < dimensions; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]

    dotProduct += leftValue * rightValue
    leftMagnitude += leftValue * leftValue
    rightMagnitude += rightValue * rightValue
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

export function calibrateSemanticScore(
  similarity: number,
  minSimilarity = DEFAULT_MIN_SEMANTIC_SIMILARITY
) {
  if (similarity <= minSimilarity) {
    return 0
  }

  return Math.min(1, (similarity - minSimilarity) / (1 - minSimilarity))
}

export async function semanticSearchWorkspace(
  workspaceId: string,
  query: string,
  options: SemanticSearchOptions = {}
): Promise<SemanticSearchResult[]> {
  const normalizedQuery = query.trim()

  if (!normalizedQuery) {
    return []
  }

  const [chunks, documents] = await Promise.all([
    (options.getChunks ?? getWorkspaceDocumentChunks)(workspaceId),
    (options.getDocuments ?? getWorkspaceDocuments)(workspaceId),
  ])
  const searchableChunks = chunks.filter(
    (chunk) => chunk.level === "child" && chunk.embedding && chunk.embedding.length > 0
  )

  if (searchableChunks.length === 0) {
    return []
  }

  const [queryEmbedding] = await (options.generateEmbeddings ?? generateEmbeddings)([
    normalizedQuery,
  ])

  if (!queryEmbedding || queryEmbedding.embedding.length === 0) {
    return []
  }

  const documentById = new Map(
    documents.map((document) => [document.id, document])
  )
  const limit = options.limit ?? 20
  const minSimilarity = options.minSimilarity ?? DEFAULT_MIN_SEMANTIC_SIMILARITY

  return searchableChunks
    .map((chunk) => {
      const similarity = cosineSimilarity(queryEmbedding.embedding, chunk.embedding ?? [])

      return {
        chunk,
        document: documentById.get(chunk.documentId),
        similarity,
        score: calibrateSemanticScore(similarity, minSimilarity),
      }
    })
    .filter((result) => result.similarity >= minSimilarity)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

export async function retrieveParentChunksForWorkspace(
  workspaceId: string,
  query: string,
  options: RetrieveParentChunksOptions = {}
): Promise<RetrievedContextChunk[]> {
  const allChunks = await (options.getChunks ?? getWorkspaceDocumentChunks)(workspaceId)
  const parentById = new Map(
    allChunks
      .filter((chunk) => chunk.level === "parent")
      .map((chunk) => [chunk.chunkId, chunk])
  )

  if (parentById.size === 0) {
    return []
  }

  const retrievalQueries = Array.from(
    new Set(
      [query, ...(options.additionalQueries ?? [])]
        .map((retrievalQuery) => retrievalQuery.trim())
        .filter(Boolean)
    )
  )
  const parentResults = new Map<string, RetrievedContextChunk>()

  for (const retrievalQuery of retrievalQueries) {
    const childResults = await semanticSearchWorkspace(workspaceId, retrievalQuery, {
      ...options,
      getChunks: async () => allChunks,
      limit: options.limit ?? 40,
    })

    for (const result of childResults) {
      const parentChunkId = result.chunk.parentChunkId

      if (!parentChunkId) {
        continue
      }

      const parentChunk = parentById.get(parentChunkId)

      if (!parentChunk) {
        continue
      }

      const existingParent = parentResults.get(parentChunkId)

      if (existingParent) {
        if (!existingParent.matchedChildChunkIds.includes(result.chunk.chunkId)) {
          existingParent.matchedChildChunkIds.push(result.chunk.chunkId)
        }

        if (!existingParent.matchedQueries?.includes(retrievalQuery)) {
          existingParent.matchedQueries = [
            ...(existingParent.matchedQueries ?? []),
            retrievalQuery,
          ]
        }

        existingParent.score = Math.max(existingParent.score, result.score)
        existingParent.similarity = Math.max(existingParent.similarity, result.similarity)
        continue
      }

      parentResults.set(parentChunkId, {
        documentId: parentChunk.documentId,
        documentName: result.document?.name,
        matchedChildChunkIds: [result.chunk.chunkId],
        matchedQueries: [retrievalQuery],
        pageNumbers: parentChunk.pageNumbers,
        parentChunkId,
        score: result.score,
        similarity: result.similarity,
        text: parentChunk.text,
      })
    }
  }

  return Array.from(parentResults.values())
    .sort((left, right) => {
      const scoreOrder = right.score - left.score

      if (scoreOrder !== 0) {
        return scoreOrder
      }

      return right.matchedChildChunkIds.length - left.matchedChildChunkIds.length
    })
    .slice(0, options.parentLimit ?? 10)
}
