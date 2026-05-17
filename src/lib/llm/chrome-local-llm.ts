import type {
  GenerateReplyInput,
  GenerateRetrievalQueryInput,
  GenerateRetrievalQueryResult,
  LlmClient,
  RetrievalMode,
} from "./types"

type ChromeAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "readily"
  | "after-download"
  | "no"

interface ChromeLanguageModelCapabilities {
  available?: ChromeAvailability
}

interface ChromeLanguageModelSession {
  prompt: (
    input: string,
    options?: {
      signal?: AbortSignal
    }
  ) => Promise<string>
  destroy?: () => void
}

interface ChromeLanguageModelFactory {
  availability?: () => Promise<ChromeAvailability>
  capabilities?: () => Promise<ChromeLanguageModelCapabilities>
  create: (options?: {
    systemPrompt?: string
    signal?: AbortSignal
  }) => Promise<ChromeLanguageModelSession>
}

declare global {
  interface Window {
    LanguageModel?: ChromeLanguageModelFactory
    ai?: {
      languageModel?: ChromeLanguageModelFactory
    }
  }
}

const supportedAvailability = new Set<ChromeAvailability>([
  "available",
  "downloadable",
  "readily",
  "after-download",
])
const supportedRetrievalModes = new Set<RetrievalMode>([
  "none",
  "inventory",
  "semantic",
  "targeted_file",
  "summary",
  "graph",
  "hybrid_graph",
])

function parseRetrievalMode(value: unknown): RetrievalMode | undefined {
  return typeof value === "string" && supportedRetrievalModes.has(value as RetrievalMode)
    ? value as RetrievalMode
    : undefined
}

function getChromeLanguageModel(): ChromeLanguageModelFactory | undefined {
  if (typeof window === "undefined") {
    return undefined
  }

  return window.LanguageModel ?? window.ai?.languageModel
}

async function getAvailability(
  languageModel: ChromeLanguageModelFactory
): Promise<ChromeAvailability> {
  if (languageModel.availability) {
    return languageModel.availability()
  }

  const capabilities = await languageModel.capabilities?.()
  return capabilities?.available ?? "unavailable"
}

function formatFileSize(size?: number) {
  if (typeof size !== "number") {
    return "size unknown"
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getDocumentStatusLabel(status: GenerateReplyInput["documents"][number]["processingStatus"]) {
  if (status === "processing") {
    return "processing"
  }

  if (status === "error") {
    return "error"
  }

  if (status === "toBeProcessed") {
    return "to be processed"
  }

  return "processed"
}

function buildDocumentContext(documents: GenerateReplyInput["documents"]) {
  if (documents.length === 0) {
    return "Workspace files count: 0.\nWorkspace files: none."
  }

  const fileLines = documents.map((document, index) => {
    const status = getDocumentStatusLabel(document.processingStatus)

    return `${index + 1}. ${document.name} (${document.type}, ${formatFileSize(document.size)}, ${status})`
  })

  return [
    `Workspace files count: ${documents.length}.`,
    `Workspace files (${documents.length}):`,
    ...fileLines,
  ].join("\n")
}

function buildRetrievedContext({ retrievedChunks }: GenerateReplyInput) {
  if (!retrievedChunks || retrievedChunks.length === 0) {
    return "Retrieved parent chunks: none."
  }

  const chunkLines = retrievedChunks.map((chunk, index) => {
    const pages = chunk.pageNumbers.length > 0 ? chunk.pageNumbers.join(", ") : "unknown"
    const source = chunk.documentName ?? chunk.documentId

    return [
      `Parent chunk ${index + 1}`,
      `Source: ${source}`,
      `Pages: ${pages}`,
      `Similarity: ${chunk.similarity.toFixed(3)}`,
      chunk.matchedQueries?.length ? `Matched queries: ${chunk.matchedQueries.join(" | ")}` : undefined,
      `Matched child chunks: ${chunk.matchedChildChunkIds.join(", ")}`,
      chunk.keywordScore !== undefined ? `Keyword score: ${chunk.keywordScore.toFixed(3)}` : undefined,
      chunk.sourceScore !== undefined && chunk.sourceScore > 0 ? `Source match score: ${chunk.sourceScore.toFixed(3)}` : undefined,
      chunk.retrievalSource ? `Retrieval source: ${chunk.retrievalSource}` : undefined,
      chunk.graphEntityNames?.length ? `Graph entities: ${chunk.graphEntityNames.join(", ")}` : undefined,
      chunk.graphEdgeTypes?.length ? `Graph edge types: ${chunk.graphEdgeTypes.join(", ")}` : undefined,
      `Relevant excerpt:\n${chunk.excerpt ?? chunk.text}`,
    ].filter(Boolean).join("\n")
  })

  return [
    "Retrieved parent chunks from semantic search:",
    ...chunkLines,
  ].join("\n\n")
}

function buildSystemPrompt({ workspaceTitle, tabLabel, documents }: GenerateReplyInput) {
  return [
    "You are DocuChat, a concise assistant that answers questions about uploaded workspace documents.",
    `Current date: ${new Date().toLocaleDateString()}.`,
    `Workspace: ${workspaceTitle}.`,
    `Active tab: ${tabLabel}.`,
    buildDocumentContext(documents),
    "Maintain conversational continuity: resolve pronouns and references from the conversation, answer follow-up questions directly, and do not restart the conversation unless asked.",
    "Use the workspace files list to understand what evidence may be available.",
    "When retrieved parent chunks are provided, use them as the primary evidence for document-content questions. Cite file names and pages when available.",
    "Every factual claim about document contents must be supported by retrieved evidence. Use citations like [File.pdf, p. 3] when pages are available.",
    "Never treat the file list as evidence of file contents. The file list only proves inventory, names, types, sizes, and processing status.",
    "If retrieved chunks are weak, partial, or unrelated, say so briefly and answer only from reliable context or ask a focused follow-up question.",
    "When graph context is present, use it to reason about relationships and cross-document links, but ground every factual answer in the retrieved evidence excerpts.",
    "Do not invent graph relationships that are not listed in the context.",
    "If no retrieved evidence supports a document-content question, say that you could not find supporting evidence in the indexed documents.",
    "For file inventory questions, such as how many files exist, file names, types, sizes, or processing status, answer directly from the workspace files list without asking for document contents.",
    "Prefer processed files. If a file is still processing or waiting to be processed, say that its contents may not be available yet.",
    "If the answer cannot be supported by the available workspace context, say what is missing instead of inventing details.",
    "Answer in 2-4 sentences. Be specific, practical, and avoid mentioning that you are a browser model.",
  ].join("\n")
}

function buildConversationContext({ messages }: GenerateReplyInput) {
  const conversation = messages
    .map((message) => `${message.side === "left" ? "User" : "Assistant"}: ${message.text}`)
    .join("\n")

  return conversation ? `Conversation so far:\n${conversation}` : "Conversation so far: none"
}

function buildPrompt(input: GenerateReplyInput) {
  return [
    "System context:",
    buildSystemPrompt(input),
    input.retrievalIntent ? `Detected user intent:\n${input.retrievalIntent}` : "Detected user intent: not provided",
    input.retrievalMode ? `Retrieval mode:\n${input.retrievalMode}` : "Retrieval mode: not provided",
    input.retrievalConfidence ? `Retrieval confidence:\n${input.retrievalConfidence}` : "Retrieval confidence: not provided",
    input.retrievalQuery ? `Semantic retrieval query used for evidence:\n${input.retrievalQuery}` : "Semantic retrieval query used for evidence: none",
    input.retrievalRationale ? `Retrieval rationale:\n${input.retrievalRationale}` : "Retrieval rationale: not provided",
    buildRetrievedContext(input),
    "Current user request — answer this request now. Preserve conversation context, but prioritize this latest request:",
    input.prompt,
    "Conversation context for continuity and reference:",
    buildConversationContext(input),
  ].join("\n\n")
}

function buildRetrievalQueryPrompt({ prompt, messages, workspaceTitle, tabLabel }: GenerateRetrievalQueryInput) {
  const conversation = messages
    .map((message) => `${message.side === "left" ? "User" : "Assistant"}: ${message.text}`)
    .join("\n")

  return [
    "Create a semantic-search query for retrieving document chunks before answering the user's latest question.",
    `Workspace: ${workspaceTitle}.`,
    `Active tab: ${tabLabel}.`,
    conversation ? `Conversation:\n${conversation}` : "Conversation: none",
    `Latest user question:\n${prompt}`,
    "Return only strict JSON with these fields:",
    `{"intent":"short intent","retrievalMode":"semantic","needsDocumentSearch":true,"searchQuery":"primary standalone retrieval query","searchQueries":["primary standalone retrieval query","alternate query with synonyms or resolved references"],"targetDocumentNames":["optional exact file names mentioned by the user"],"resolvedReferences":["short resolved follow-up references"],"graphEntities":["entity or topic names for graph traversal"],"graphDepth":1,"rationale":"short rationale"}`,
    "The searchQuery must be standalone: rewrite vague follow-ups like 'and that one?' using the relevant entities from the conversation.",
    "Use retrievalMode one of: none, inventory, semantic, targeted_file, summary, graph, hybrid_graph.",
    "Use graph for relationship-only questions about entities, dependencies, links, or co-occurrence.",
    "Use hybrid_graph for comparisons, cross-document synthesis, recurring themes, or questions that need both evidence chunks and entity relationships.",
    "Use targeted_file when the user names or clearly refers to a specific file. Put exact file names in targetDocumentNames.",
    "Use summary for broad summarization requests; include broader searchQueries that cover the named file or workspace topic.",
    "Use inventory and needsDocumentSearch=false for file count/name/type/status questions.",
    "Keep important names, dates, products, clauses, metrics, and document terms from the user's wording.",
    "Set needsDocumentSearch to false only for greetings, UI-only actions, or questions that can be answered from the file inventory without document contents.",
  ].join("\n\n")
}

function parseRetrievalQueryResult(response: string, fallbackPrompt: string): GenerateRetrievalQueryResult {
  const jsonMatch = response.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    return {
      intent: "Answer the latest user question.",
      needsDocumentSearch: true,
      searchQuery: fallbackPrompt,
      rationale: "The retrieval-query response was not valid JSON.",
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<GenerateRetrievalQueryResult>
    const searchQueries = Array.isArray(parsed.searchQueries)
      ? parsed.searchQueries.filter((query): query is string => typeof query === "string")
      : undefined
    const targetDocumentNames = Array.isArray(parsed.targetDocumentNames)
      ? parsed.targetDocumentNames.filter((name): name is string => typeof name === "string")
      : undefined
    const resolvedReferences = Array.isArray(parsed.resolvedReferences)
      ? parsed.resolvedReferences.filter((reference): reference is string => typeof reference === "string")
      : undefined
    const graphEntities = Array.isArray(parsed.graphEntities)
      ? parsed.graphEntities.filter((entity): entity is string => typeof entity === "string")
      : undefined

    return {
      intent: typeof parsed.intent === "string" ? parsed.intent : "Answer the latest user question.",
      retrievalMode: parseRetrievalMode(parsed.retrievalMode),
      needsDocumentSearch: typeof parsed.needsDocumentSearch === "boolean" ? parsed.needsDocumentSearch : true,
      searchQuery: typeof parsed.searchQuery === "string" && parsed.searchQuery.trim().length > 0
        ? parsed.searchQuery
        : fallbackPrompt,
      searchQueries,
      targetDocumentNames,
      resolvedReferences,
      graphDepth: typeof parsed.graphDepth === "number" ? parsed.graphDepth : undefined,
      graphEntities,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : undefined,
    }
  } catch {
    return {
      intent: "Answer the latest user question.",
      needsDocumentSearch: true,
      searchQuery: fallbackPrompt,
      rationale: "The retrieval-query JSON could not be parsed.",
    }
  }
}

export function createChromeLocalLlmClient(): LlmClient {
  return {
    id: "chrome-local-llm",
    label: "Chrome Local LLM",
    isAvailable: async () => {
      const languageModel = getChromeLanguageModel()

      if (!languageModel) {
        return false
      }

      const availability = await getAvailability(languageModel)
      return supportedAvailability.has(availability)
    },
    generateReply: async (input) => {
      const languageModel = getChromeLanguageModel()

      if (!languageModel) {
        throw new Error("Chrome local LLM is not available in this browser.")
      }

      const availability = await getAvailability(languageModel)

      if (!supportedAvailability.has(availability)) {
        throw new Error(`Chrome local LLM is ${availability}.`)
      }

      const systemPrompt = buildSystemPrompt(input)
      const session = await languageModel.create({
        systemPrompt,
        signal: input.signal,
      })

      try {
        return await session.prompt(buildPrompt(input), {
          signal: input.signal,
        })
      } finally {
        session.destroy?.()
      }
    },
    generateRetrievalQuery: async (input) => {
      const languageModel = getChromeLanguageModel()

      if (!languageModel) {
        throw new Error("Chrome local LLM is not available in this browser.")
      }

      const availability = await getAvailability(languageModel)

      if (!supportedAvailability.has(availability)) {
        throw new Error(`Chrome local LLM is ${availability}.`)
      }

      const session = await languageModel.create({
        systemPrompt: "You generate concise semantic-search queries for a document chat application. Return strict JSON only.",
        signal: input.signal,
      })

      try {
        const response = await session.prompt(buildRetrievalQueryPrompt(input), {
          signal: input.signal,
        })

        return parseRetrievalQueryResult(response, input.prompt)
      } finally {
        session.destroy?.()
      }
    },
  }
}
