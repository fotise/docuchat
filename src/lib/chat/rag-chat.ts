import { DEFAULT_MIN_SEMANTIC_SIMILARITY, retrieveParentChunksForWorkspace } from "@/lib/file-processing/semantic-search"
import type {
  GenerateReplyDocumentInfo,
  GenerateReplyInput,
  GenerateRetrievalQueryResult,
  LlmClient,
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

function createFallbackRetrievalQuery(input: GenerateReplyInput): GenerateRetrievalQueryResult {
  const recentConversation = input.messages
    .slice(-8)
    .map((message) => `${message.side === "left" ? "User" : "Assistant"}: ${message.text}`)
  const searchQuery = [...recentConversation, `Current question: ${input.prompt}`].join("\n")

  return {
    intent: "Answer the user's latest question using relevant workspace documents when possible.",
    needsDocumentSearch: !shouldSkipDocumentSearch(input.prompt),
    searchQuery,
    rationale: "Fallback retrieval query built from the latest user question and recent user messages.",
  }
}

export async function generateRagReply({
  workspace,
  tabLabel,
  prompt,
  messages,
  llmClient,
  retrieveParentChunks = retrieveParentChunksForWorkspace,
  signal,
}: GenerateRagReplyInput): Promise<string> {
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

  const retrievalQuery = retrievalQueryResult.searchQuery.trim() || prompt
  let retrievedChunks: GenerateReplyInput["retrievedChunks"] = []

  if (retrievalQueryResult.needsDocumentSearch) {
    try {
      retrievedChunks = await retrieveParentChunks(workspace.id, retrievalQuery, {
        additionalQueries: retrievalQuery === prompt ? [] : [prompt],
        minSimilarity: workspace.semanticSearchThreshold ?? DEFAULT_MIN_SEMANTIC_SIMILARITY,
        parentLimit: 10,
      })
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }
    }
  }

  return llmClient.generateReply({
    ...baseInput,
    retrievalIntent: retrievalQueryResult.intent,
    retrievalQuery,
    retrievalRationale: retrievalQueryResult.rationale,
    retrievedChunks,
  })
}
