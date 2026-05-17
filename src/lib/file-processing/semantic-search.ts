import {
  getWorkspaceDocuments,
  getWorkspaceDocumentChunks,
  type StoredDocumentChunk,
  type StoredWorkspaceDocument,
} from "@/lib/chat-history/indexed-db"
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

  const [queryEmbedding] = await (options.generateEmbeddings ?? generateEmbeddings)([
    normalizedQuery,
  ])

  if (!queryEmbedding || queryEmbedding.embedding.length === 0) {
    return []
  }

  const [chunks, documents] = await Promise.all([
    (options.getChunks ?? getWorkspaceDocumentChunks)(workspaceId),
    (options.getDocuments ?? getWorkspaceDocuments)(workspaceId),
  ])
  const documentById = new Map(
    documents.map((document) => [document.id, document])
  )
  const limit = options.limit ?? 20
  const minSimilarity = options.minSimilarity ?? DEFAULT_MIN_SEMANTIC_SIMILARITY

  return chunks
    .filter((chunk) => chunk.level === "child" && chunk.embedding && chunk.embedding.length > 0)
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
