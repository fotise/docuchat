import { DEFAULT_MIN_SEMANTIC_SIMILARITY, retrieveParentChunksForWorkspace } from "@/lib/file-processing/semantic-search"
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
  retrieveParentChunks?: typeof retrieveParentChunksForWorkspace
  signal?: AbortSignal
}

interface GenerateRagRetrievalContextInput extends GenerateRagReplyInput {
  additionalQueries?: string[]
  childMatchLimit?: number
  parentChunkLimit?: number
  targetDocumentNames?: string[]
}

export interface RagRetrievalContext {
  baseInput: GenerateReplyInput
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
    rationale: "Fallback retrieval query built from the latest user question and recent user messages.",
  }
}

export async function generateRagRetrievalContext({
  workspace,
  tabLabel,
  prompt,
  messages,
  llmClient,
  retrieveParentChunks = retrieveParentChunksForWorkspace,
  additionalQueries = [],
  childMatchLimit,
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
  let retrievedChunks: GenerateReplyInput["retrievedChunks"] = []

  if (retrievalQueryResult.needsDocumentSearch && retrievalMode !== "none" && retrievalMode !== "inventory") {
    try {
      retrievedChunks = await retrieveParentChunks(workspace.id, retrievalQuery, {
        additionalQueries: searchQueries.slice(1),
        limit: childMatchLimit ?? workspace.ragSearchChildMatchLimit ?? 40,
        minSimilarity: workspace.semanticSearchThreshold ?? DEFAULT_MIN_SEMANTIC_SIMILARITY,
        parentLimit: parentChunkLimit ?? workspace.ragSearchParentChunkLimit ?? 10,
        targetDocumentNames: resolvedTargetDocumentNames,
      })
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }
    }
  }

  return {
    baseInput,
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
