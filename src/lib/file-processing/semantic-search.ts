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
  keywordScore: number
  sourceScore: number
}

interface SemanticSearchOptions {
  generateEmbeddings?: (texts: string[]) => Promise<GeneratedEmbedding[]>
  getChunks?: (workspaceId: string) => Promise<StoredDocumentChunk[]>
  getDocuments?: (workspaceId: string) => Promise<StoredWorkspaceDocument[]>
  limit?: number
  minSimilarity?: number
  targetDocumentNames?: string[]
}

interface RetrieveParentChunksOptions extends SemanticSearchOptions {
  additionalQueries?: string[]
  parentLimit?: number
}

export const DEFAULT_MIN_SEMANTIC_SIMILARITY = 0.3
const MAX_PARENT_EXCERPT_LENGTH = 1_800
const STOP_WORDS = new Set([
  "a",
  "about",
  "and",
  "are",
  "che",
  "con",
  "cosa",
  "dei",
  "del",
  "della",
  "di",
  "does",
  "for",
  "gli",
  "how",
  "il",
  "in",
  "is",
  "it",
  "la",
  "le",
  "me",
  "nel",
  "of",
  "on",
  "per",
  "quali",
  "qual",
  "the",
  "to",
  "un",
  "una",
  "what",
])

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function tokenize(value: string) {
  return normalizeSearchText(value)
    .split(/[^a-z0-9_]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
}

function scoreKeywordMatch(query: string, text: string) {
  const queryTokens = Array.from(new Set(tokenize(query)))

  if (queryTokens.length === 0) {
    return 0
  }

  const normalizedText = normalizeSearchText(text)
  const matchedTokens = queryTokens.filter((token) => normalizedText.includes(token))

  return matchedTokens.length / queryTokens.length
}

function matchesTargetDocument(document: StoredWorkspaceDocument | undefined, targets: string[]) {
  if (!document || targets.length === 0) {
    return false
  }

  const normalizedName = normalizeSearchText(document.name)
  const baseName = normalizedName.replace(/\.[^.]+$/, "")

  return targets.some((target) => {
    const normalizedTarget = normalizeSearchText(target)

    return normalizedName.includes(normalizedTarget)
      || normalizedTarget.includes(normalizedName)
      || baseName.includes(normalizedTarget)
      || normalizedTarget.includes(baseName)
  })
}

function buildParentExcerpt(parentText: string, queries: string[]) {
  const normalizedQueries = queries.map((query) => query.trim()).filter(Boolean)
  const keywords = Array.from(new Set(normalizedQueries.flatMap(tokenize)))
  const sentences = parentText
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  if (sentences.length === 0) {
    return parentText.slice(0, MAX_PARENT_EXCERPT_LENGTH)
  }

  const scoredSentences = sentences
    .map((sentence, index) => ({
      index,
      sentence,
      score: scoreKeywordMatch(keywords.join(" "), sentence),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)

  const excerptSentences = (scoredSentences.length > 0
    ? scoredSentences.slice(0, 5).sort((left, right) => left.index - right.index)
    : sentences.slice(0, 5).map((sentence, index) => ({ index, sentence, score: 0 })))
    .map((item) => item.sentence)
  const excerpt = excerptSentences.join(" ")

  return excerpt.length > MAX_PARENT_EXCERPT_LENGTH
    ? `${excerpt.slice(0, MAX_PARENT_EXCERPT_LENGTH)}…`
    : excerpt
}

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
  const normalizedTargets = (options.targetDocumentNames ?? [])
    .map((target) => target.trim())
    .filter(Boolean)
  const targetDocumentIds = new Set(
    documents
      .filter((document) => matchesTargetDocument(document, normalizedTargets))
      .map((document) => document.id)
  )
  const filteredChunks = targetDocumentIds.size > 0
    ? searchableChunks.filter((chunk) => targetDocumentIds.has(chunk.documentId))
    : searchableChunks
  const limit = options.limit ?? 20
  const minSimilarity = options.minSimilarity ?? DEFAULT_MIN_SEMANTIC_SIMILARITY

  return filteredChunks
    .map((chunk) => {
      const document = documentById.get(chunk.documentId)
      const similarity = cosineSimilarity(queryEmbedding.embedding, chunk.embedding ?? [])
      const semanticScore = calibrateSemanticScore(similarity, minSimilarity)
      const keywordScore = scoreKeywordMatch(normalizedQuery, chunk.text)
      const sourceScore = matchesTargetDocument(document, normalizedTargets) ? 1 : 0
      const score = Math.min(
        1,
        semanticScore * 0.7 + keywordScore * 0.25 + sourceScore * 0.05
      )

      return {
        chunk,
        document,
        similarity,
        score,
        keywordScore,
        sourceScore,
      }
    })
    .filter((result) => result.similarity >= minSimilarity || result.keywordScore >= 0.25)
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
        existingParent.keywordScore = Math.max(existingParent.keywordScore ?? 0, result.keywordScore)
        existingParent.sourceScore = Math.max(existingParent.sourceScore ?? 0, result.sourceScore)
        existingParent.excerpt = buildParentExcerpt(parentChunk.text, existingParent.matchedQueries ?? [])
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
        excerpt: buildParentExcerpt(parentChunk.text, [retrievalQuery]),
        keywordScore: result.keywordScore,
        sourceScore: result.sourceScore,
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
