import { DEFAULT_MIN_SEMANTIC_SIMILARITY, retrieveParentChunksForWorkspace } from "@/lib/file-processing/semantic-search"
import { retrieveGraphContextForWorkspace } from "@/lib/file-processing/graph-search"
import type {
  GenerateReplyDocumentInfo,
  GenerateReplyInput,
  GenerateRetrievalQueryResult,
  LlmClient,
  RetrievalConfidence,
  RetrievalMode,
} from "@/lib/llm/types"
import type { WorkspaceMessage, WorkspaceRouteConfig } from "@/types/dashboard"

interface GenerateRagReplyInput {
  workspace: WorkspaceRouteConfig
  tabLabel: string
  prompt: string
  messages: WorkspaceMessage[]
  llmClient: LlmClient
  retrieveGraphContext?: typeof retrieveGraphContextForWorkspace
  retrieveParentChunks?: typeof retrieveParentChunksForWorkspace
  signal?: AbortSignal
}

interface GenerateRagRetrievalContextInput extends GenerateRagReplyInput {
  additionalQueries?: string[]
  childMatchLimit?: number
  graphDepth?: number
  graphEntityQueries?: string[]
  parentChunkLimit?: number
  targetDocumentNames?: string[]
}

export interface RagRetrievalContext {
  baseInput: GenerateReplyInput
  retrievalError?: string
  retrievalConfidence: RetrievalConfidence
  retrievalMode: RetrievalMode
  retrievalQuery: string
  retrievalQueryResult: GenerateRetrievalQueryResult
  retrievedChunks: NonNullable<GenerateReplyInput["retrievedChunks"]>
  searchQueries: string[]
  targetDocumentNames: string[]
}

function getWorkspaceDocuments(workspace: WorkspaceRouteConfig): GenerateReplyDocumentInfo[] {
  return workspace.uploadedDocuments.map((document) => ({
    name: document.name,
    type: document.type,
    size: document.size,
    processingStatus: document.processingStatus,
  }))
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function ensureLatestUserMessage(
  messages: WorkspaceMessage[],
  prompt: string
): WorkspaceMessage[] {
  const normalizedPrompt = normalizeText(prompt)
  const lastMessage = messages.at(-1)

  if (lastMessage?.side === "left" && normalizeText(lastMessage.text) === normalizedPrompt) {
    return messages
  }

  return [
    ...messages,
    {
      id: "current-user-request",
      side: "left",
      text: prompt,
    },
  ]
}

function shouldSkipDocumentSearch(prompt: string) {
  const normalizedPrompt = normalizeText(prompt)

  return /^(ciao|salve|hey|hello|hi|buongiorno|buonasera|grazie|ok|okay|perfetto)[.!?\s]*$/.test(
    normalizedPrompt
  )
}

function inferRetrievalMode(prompt: string): RetrievalMode {
  if (shouldSkipDocumentSearch(prompt)) {
    return "none"
  }

  const normalizedPrompt = normalizeText(prompt)

  if (/\b(quanti|how many|lista|list|nomi|names|file|documenti|documents)\b/.test(normalizedPrompt)) {
    return "inventory"
  }

  if (/\b(riassum|sintesi|summary|summarize|overview)\b/.test(normalizedPrompt)) {
    return "summary"
  }

  if (/\b(relazione|relationship|collega|connected|compare|confronta|dipenden|depends|between|tra|entity|entities|tema|temi)\b/.test(normalizedPrompt)) {
    return "hybrid_graph"
  }

  return "semantic"
}

function getRetrievalMode(result: GenerateRetrievalQueryResult, prompt: string): RetrievalMode {
  if (!result.needsDocumentSearch) {
    return result.retrievalMode ?? inferRetrievalMode(prompt)
  }

  return result.retrievalMode ?? inferRetrievalMode(prompt)
}

function getSearchQueries(result: GenerateRetrievalQueryResult, prompt: string) {
  return Array.from(
    new Set(
      [result.searchQuery, ...(result.searchQueries ?? []), prompt]
        .map((query) => query.trim())
        .filter(Boolean)
    )
  )
}

function estimateRetrievalConfidence(
  chunks: NonNullable<GenerateReplyInput["retrievedChunks"]>
): RetrievalConfidence {
  if (chunks.length === 0) {
    return "none"
  }

  const bestScore = Math.max(...chunks.map((chunk) => chunk.score))
  const bestSimilarity = Math.max(...chunks.map((chunk) => chunk.similarity))
  const totalMatches = chunks.reduce(
    (total, chunk) => total + chunk.matchedChildChunkIds.length,
    0
  )

  if (bestScore >= 0.72 || bestSimilarity >= 0.78 || (chunks.length >= 3 && totalMatches >= 4)) {
    return "high"
  }

  if (bestScore >= 0.42 || bestSimilarity >= 0.55 || totalMatches >= 2) {
    return "medium"
  }

  return "low"
}

function createFallbackRetrievalQuery(input: GenerateReplyInput): GenerateRetrievalQueryResult {
  const recentConversation = input.messages
    .slice(-8)
    .map((message) => `${message.side === "left" ? "User" : "Assistant"}: ${message.text}`)
  const searchQuery = [...recentConversation, `Current question: ${input.prompt}`].join("\n")

  return {
    intent: "Answer the user's latest question using relevant workspace documents when possible.",
    retrievalMode: inferRetrievalMode(input.prompt),
    needsDocumentSearch: !shouldSkipDocumentSearch(input.prompt),
    searchQuery,
    searchQueries: [searchQuery, input.prompt],
    targetDocumentNames: input.documents
      .filter((document) => normalizeText(input.prompt).includes(normalizeText(document.name).replace(/\.[^.]+$/, "")))
      .map((document) => document.name),
    graphDepth: 1,
    graphEntities: [],
    rationale: "Fallback retrieval query built from the latest user question and recent user messages.",
  }
}

function mergeRetrievedChunks(
  semanticChunks: NonNullable<GenerateReplyInput["retrievedChunks"]>,
  graphChunks: NonNullable<GenerateReplyInput["retrievedChunks"]>
) {
  const mergedByParentId = new Map<string, NonNullable<GenerateReplyInput["retrievedChunks"]>[number]>()

  for (const chunk of semanticChunks) {
    mergedByParentId.set(chunk.parentChunkId, {
      ...chunk,
      retrievalSource: chunk.retrievalSource ?? "semantic",
    })
  }

  for (const graphChunk of graphChunks) {
    const existing = mergedByParentId.get(graphChunk.parentChunkId)

    if (!existing) {
      mergedByParentId.set(graphChunk.parentChunkId, graphChunk)
      continue
    }

    mergedByParentId.set(graphChunk.parentChunkId, {
      ...existing,
      excerpt: existing.excerpt ?? graphChunk.excerpt,
      graphEdgeTypes: Array.from(new Set([...(existing.graphEdgeTypes ?? []), ...(graphChunk.graphEdgeTypes ?? [])])),
      graphEntityNames: Array.from(new Set([...(existing.graphEntityNames ?? []), ...(graphChunk.graphEntityNames ?? [])])),
      matchedChildChunkIds: Array.from(new Set([...existing.matchedChildChunkIds, ...graphChunk.matchedChildChunkIds])),
      matchedQueries: Array.from(new Set([...(existing.matchedQueries ?? []), ...(graphChunk.matchedQueries ?? [])])),
      retrievalSource: "hybrid",
      score: Math.min(1, existing.score * 0.6 + graphChunk.score * 0.4 + 0.1),
      similarity: Math.max(existing.similarity, graphChunk.similarity),
    })
  }

  return Array.from(mergedByParentId.values()).sort((left, right) => right.score - left.score)
}

export async function generateRagRetrievalContext({
  workspace,
  tabLabel,
  prompt,
  messages,
  llmClient,
  retrieveGraphContext = retrieveGraphContextForWorkspace,
  retrieveParentChunks = retrieveParentChunksForWorkspace,
  additionalQueries = [],
  childMatchLimit,
  graphDepth,
  graphEntityQueries = [],
  parentChunkLimit,
  targetDocumentNames = [],
  signal,
}: GenerateRagRetrievalContextInput): Promise<RagRetrievalContext> {
  const conversationMessages = ensureLatestUserMessage(messages, prompt)
  const baseInput: GenerateReplyInput = {
    workspaceTitle: workspace.title,
    tabLabel,
    documents: getWorkspaceDocuments(workspace),
    prompt,
    messages: conversationMessages,
    signal,
  }
  let retrievalQueryResult: GenerateRetrievalQueryResult

  try {
    retrievalQueryResult = llmClient.generateRetrievalQuery
      ? await llmClient.generateRetrievalQuery(baseInput)
      : createFallbackRetrievalQuery(baseInput)
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }

    retrievalQueryResult = createFallbackRetrievalQuery(baseInput)
  }

  const retrievalMode = getRetrievalMode(retrievalQueryResult, prompt)
  const searchQueries = Array.from(
    new Set([...getSearchQueries(retrievalQueryResult, prompt), ...additionalQueries]
    )
  )
  const retrievalQuery = searchQueries[0] ?? prompt
  const resolvedTargetDocumentNames = Array.from(
    new Set([...(retrievalQueryResult.targetDocumentNames ?? []), ...targetDocumentNames])
  )
  const graphQueries = Array.from(
    new Set([...(retrievalQueryResult.graphEntities ?? []), ...graphEntityQueries, ...searchQueries])
  )
  let retrievedChunks: GenerateReplyInput["retrievedChunks"] = []
  let retrievalError: string | undefined

  if (retrievalQueryResult.needsDocumentSearch && retrievalMode !== "none" && retrievalMode !== "inventory") {
    try {
      const shouldUseSemantic = retrievalMode !== "graph"
      const shouldUseGraph = retrievalMode === "graph" || retrievalMode === "hybrid_graph"
      const [semanticChunks, graphChunks] = await Promise.all([
        shouldUseSemantic
          ? retrieveParentChunks(workspace.id, retrievalQuery, {
              additionalQueries: searchQueries.slice(1),
              limit: childMatchLimit ?? workspace.ragSearchChildMatchLimit ?? 40,
              minSimilarity: workspace.semanticSearchThreshold ?? DEFAULT_MIN_SEMANTIC_SIMILARITY,
              parentLimit: parentChunkLimit ?? workspace.ragSearchParentChunkLimit ?? 10,
              targetDocumentNames: resolvedTargetDocumentNames,
            })
          : Promise.resolve([]),
        shouldUseGraph
          ? retrieveGraphContext(workspace.id, retrievalQuery, {
              depth: graphDepth ?? retrievalQueryResult.graphDepth ?? workspace.graphSearchDepth ?? 1,
              entityQueries: graphQueries,
              limit: parentChunkLimit ?? workspace.ragSearchParentChunkLimit ?? 10,
              targetDocumentNames: resolvedTargetDocumentNames,
            })
          : Promise.resolve([]),
      ])

      retrievedChunks = mergeRetrievedChunks(semanticChunks, graphChunks).slice(
        0,
        parentChunkLimit ?? workspace.ragSearchParentChunkLimit ?? 10
      )
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }

      retrievalError = error instanceof Error ? error.message : "Document retrieval failed."
    }
  }

  return {
    baseInput,
    retrievalError,
    retrievalConfidence: estimateRetrievalConfidence(retrievedChunks),
    retrievalMode,
    retrievalQuery,
    retrievalQueryResult,
    retrievedChunks,
    searchQueries,
    targetDocumentNames: resolvedTargetDocumentNames,
  }
}

export async function generateRagReply(input: GenerateRagReplyInput): Promise<string> {
  const {
    baseInput,
    retrievalConfidence,
    retrievalMode,
    retrievalQuery,
    retrievalQueryResult,
    retrievedChunks,
  } = await generateRagRetrievalContext(input)

  return input.llmClient.generateReply({
    ...baseInput,
    retrievalIntent: retrievalQueryResult.intent,
    retrievalMode,
    retrievalQuery,
    retrievalRationale: retrievalQueryResult.rationale,
    retrievalConfidence,
    retrievedChunks,
  })
}
