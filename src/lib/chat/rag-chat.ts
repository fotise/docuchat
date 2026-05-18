import { DEFAULT_MIN_SEMANTIC_SIMILARITY, retrieveParentChunksForWorkspace } from "@/lib/file-processing/semantic-search"
import { retrieveGraphContextForWorkspace } from "@/lib/file-processing/graph-search"
import type {
  GenerateReplyDocumentInfo,
  GenerateReplyInput,
  GenerateRetrievalQueryResult,
  LlmDebugPromptEvent,
  LlmClient,
  RagDebugTrace,
  RagDebugTraceChunk,
  RetrievalConfidence,
  RetrievalMode,
} from "@/lib/llm/types"
import type { WorkspaceMessage, WorkspaceRouteConfig } from "@/types/dashboard"

interface GenerateRagReplyInput {
  additionalQueries?: string[]
  childMatchLimit?: number
  debugTraceEnabled?: boolean
  graphDepth?: number
  graphEntityQueries?: string[]
  includeDebugTraceExcerpts?: boolean
  onDebugTrace?: (trace: RagDebugTrace) => void
  workspace: WorkspaceRouteConfig
  tabLabel: string
  prompt: string
  messages: WorkspaceMessage[]
  llmClient: LlmClient
  onProgress?: (message: string) => void
  onToken?: (partialText: string) => void
  parentChunkLimit?: number
  retrieveGraphContext?: typeof retrieveGraphContextForWorkspace
  retrieveParentChunks?: typeof retrieveParentChunksForWorkspace
  retrievalModeOverride?: RetrievalMode
  signal?: AbortSignal
  targetDocumentNames?: string[]
}

type GenerateRagRetrievalContextInput = GenerateRagReplyInput

export interface RagRetrievalContext {
  baseInput: GenerateReplyInput
  debugTrace?: RagDebugTrace
  retrievalError?: string
  retrievalConfidence: RetrievalConfidence
  retrievalDiagnostics: {
    effectiveSearchQueries: string[]
    effectiveTargetDocumentNames: string[]
    graphChunkCount: number
    graphError?: string
    semanticChunkCount: number
    semanticError?: string
  }
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

const PLANNER_PLACEHOLDER_VALUES = new Set([
  "alternate query with synonyms or resolved references",
  "entity or topic names for graph traversal",
  "optional exact file names mentioned by the user",
  "primary standalone retrieval query",
  "short resolved follow up references",
  "short resolved follow-up references",
])

function isMeaningfulPlannerValue(value: string) {
  const normalized = value.trim().toLowerCase()

  return normalized.length > 0 && !PLANNER_PLACEHOLDER_VALUES.has(normalized)
}

function getSearchQueries(result: GenerateRetrievalQueryResult, prompt: string) {
  return Array.from(
    new Set(
      [result.searchQuery, ...(result.searchQueries ?? []), prompt]
        .map((query) => query.trim())
        .filter(isMeaningfulPlannerValue)
    )
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function createTraceId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function truncateText(value: string | undefined, maxLength = 700) {
  if (!value) {
    return undefined
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function toTraceChunks(
  chunks: NonNullable<GenerateReplyInput["retrievedChunks"]>,
  includeExcerpts: boolean
): RagDebugTraceChunk[] {
  return chunks.map((chunk) => ({
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    excerpt: includeExcerpts ? truncateText(chunk.excerpt ?? chunk.text) : undefined,
    graphEdgeTypes: chunk.graphEdgeTypes,
    graphEntityNames: chunk.graphEntityNames,
    matchedChildChunkIds: chunk.matchedChildChunkIds,
    matchedQueries: chunk.matchedQueries,
    pageNumbers: chunk.pageNumbers,
    parentChunkId: chunk.parentChunkId,
    retrievalSource: chunk.retrievalSource,
    score: chunk.score,
    similarity: chunk.similarity,
  }))
}

function applyPromptEventToTrace(trace: RagDebugTrace, event: LlmDebugPromptEvent) {
  trace.model = {
    clientId: event.clientId,
    clientLabel: event.clientLabel,
    finalPrompt: event.finalPrompt ?? trace.model?.finalPrompt,
    retrievalPrompt: event.retrievalPrompt ?? trace.model?.retrievalPrompt,
    systemPrompt: event.systemPrompt ?? trace.model?.systemPrompt,
  }
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

  const hasSemanticEvidence = semanticChunks.length > 0
  const sourcePriority = (chunk: NonNullable<GenerateReplyInput["retrievedChunks"]>[number]) => {
    if (!hasSemanticEvidence) {
      return 0
    }

    if (chunk.retrievalSource === "hybrid") {
      return 2
    }

    if (chunk.retrievalSource === "semantic" || !chunk.retrievalSource) {
      return 1
    }

    return 0
  }

  return Array.from(mergedByParentId.values()).sort((left, right) => {
    const priorityDifference = sourcePriority(right) - sourcePriority(left)

    return priorityDifference !== 0 ? priorityDifference : right.score - left.score
  })
}

function waitForUiFrame() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

export async function generateRagRetrievalContext({
  workspace,
  tabLabel,
  prompt,
  messages,
  llmClient,
  retrieveGraphContext = retrieveGraphContextForWorkspace,
  retrieveParentChunks = retrieveParentChunksForWorkspace,
  onProgress,
  additionalQueries = [],
  childMatchLimit,
  debugTraceEnabled = false,
  graphDepth,
  graphEntityQueries = [],
  includeDebugTraceExcerpts = false,
  onDebugTrace,
  parentChunkLimit,
  retrievalModeOverride,
  targetDocumentNames = [],
  signal,
}: GenerateRagRetrievalContextInput): Promise<RagRetrievalContext> {
  const conversationMessages = ensureLatestUserMessage(messages, prompt)
  onProgress?.("Preparing your request…")
  const baseInput: GenerateReplyInput = {
    workspaceTitle: workspace.title,
    tabLabel,
    documents: getWorkspaceDocuments(workspace),
    prompt,
    messages: conversationMessages,
    signal,
  }
  const promptEvents: LlmDebugPromptEvent[] = []
  const plannerInput: GenerateReplyInput = {
    ...baseInput,
    onDebugPrompt: debugTraceEnabled ? (event) => {
      promptEvents.push(event)
    } : undefined,
  }
  let retrievalQueryResult: GenerateRetrievalQueryResult

  try {
    onProgress?.("Planning document retrieval…")
    retrievalQueryResult = llmClient.generateRetrievalQuery
      ? await llmClient.generateRetrievalQuery(plannerInput)
      : createFallbackRetrievalQuery(baseInput)
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }

    retrievalQueryResult = createFallbackRetrievalQuery(baseInput)
  }

  const retrievalMode = retrievalModeOverride ?? getRetrievalMode(retrievalQueryResult, prompt)
  const needsDocumentSearch = retrievalModeOverride
    ? retrievalModeOverride !== "none" && retrievalModeOverride !== "inventory"
    : retrievalQueryResult.needsDocumentSearch
  const plannerSearchQueries = getSearchQueries(retrievalQueryResult, prompt)
  const searchQueries = Array.from(
    new Set([
      ...(retrievalModeOverride ? [prompt, ...plannerSearchQueries] : plannerSearchQueries),
      ...additionalQueries,
    ].map((query) => query.trim()).filter(Boolean))
  )
  const retrievalQuery = searchQueries[0] ?? prompt
  const resolvedTargetDocumentNames = Array.from(
    new Set(retrievalModeOverride
      ? targetDocumentNames
      : [...(retrievalQueryResult.targetDocumentNames ?? []), ...targetDocumentNames]
    )
  ).filter(isMeaningfulPlannerValue)
  const graphQueries = Array.from(
    new Set([...(retrievalQueryResult.graphEntities ?? []), ...graphEntityQueries, ...searchQueries])
  ).filter(isMeaningfulPlannerValue)
  let retrievedChunks: GenerateReplyInput["retrievedChunks"] = []
  let retrievalError: string | undefined
  let semanticChunkCount = 0
  let graphChunkCount = 0
  let semanticError: string | undefined
  let graphError: string | undefined

  if (needsDocumentSearch && retrievalMode !== "none" && retrievalMode !== "inventory") {
    try {
      const shouldUseSemantic = retrievalMode !== "graph"
      const shouldUseGraph = retrievalMode === "graph" || retrievalMode === "hybrid_graph"
      const retrievalSteps = [
        shouldUseSemantic ? "semantic search" : undefined,
        shouldUseGraph ? "graph traversal" : undefined,
      ].filter(Boolean).join(" and ")

      onProgress?.(`Retrieving context with ${retrievalSteps}…`)
      const [semanticResult, graphResult] = await Promise.allSettled([
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

      if (semanticResult.status === "rejected" && graphResult.status === "rejected") {
        semanticError = getErrorMessage(semanticResult.reason, "semantic search failed.")
        graphError = getErrorMessage(graphResult.reason, "graph traversal failed.")
        throw semanticResult.reason
      }

      const semanticChunks = semanticResult.status === "fulfilled" ? semanticResult.value : []
      const graphChunks = graphResult.status === "fulfilled" ? graphResult.value : []

      semanticChunkCount = semanticChunks.length
      graphChunkCount = graphChunks.length

      if (semanticResult.status === "rejected" || graphResult.status === "rejected") {
        const failedStep = semanticResult.status === "rejected" ? "semantic search" : "graph traversal"
        const reason = semanticResult.status === "rejected"
          ? semanticResult.reason
          : graphResult.status === "rejected"
            ? graphResult.reason
            : undefined
        const message = getErrorMessage(reason, `${failedStep} failed.`)

        if (semanticResult.status === "rejected") {
          semanticError = message
        }

        if (graphResult.status === "rejected") {
          graphError = message
        }

        retrievalError = `${failedStep} failed; showing available ${semanticChunks.length > 0 ? "semantic" : "graph"} results. ${message}`
      } else if (retrievalMode === "hybrid_graph" && semanticChunks.length > 0 && graphChunks.length === 0) {
        retrievalError = "Graph traversal returned no chunks; showing semantic results from the same prompt."
      }

      retrievedChunks = mergeRetrievedChunks(semanticChunks, graphChunks).slice(
        0,
        parentChunkLimit ?? workspace.ragSearchParentChunkLimit ?? 10
      )
      onProgress?.(
        retrievedChunks.length > 0
          ? `Found ${retrievedChunks.length} relevant context ${retrievedChunks.length === 1 ? "chunk" : "chunks"}.`
          : "No strong document context found; preparing a transparent answer…"
      )
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }

      retrievalError = getErrorMessage(error, "Document retrieval failed.")
      onProgress?.("Retrieval had an issue; continuing with available context…")
    }
  } else if (retrievalMode === "inventory") {
    onProgress?.("Using workspace file inventory…")
  } else {
    onProgress?.("No document retrieval needed for this turn…")
  }

  const retrievalConfidence = estimateRetrievalConfidence(retrievedChunks)
  const debugTrace: RagDebugTrace | undefined = debugTraceEnabled
    ? {
        id: createTraceId(),
        createdAt: new Date().toISOString(),
        workspaceTitle: workspace.title,
        tabLabel,
        userPrompt: prompt,
        selectedRetrievalMode: retrievalModeOverride ?? "auto",
        effectiveRetrievalMode: retrievalMode,
        searchCriteria: {
          additionalQueries,
          childMatchLimit,
          graphDepth,
          graphEntityQueries,
          parentChunkLimit,
          targetDocumentNames,
        },
        planner: {
          input: baseInput,
          result: retrievalQueryResult,
        },
        retrieval: {
          confidence: retrievalConfidence,
          diagnostics: {
            effectiveSearchQueries: searchQueries,
            effectiveTargetDocumentNames: resolvedTargetDocumentNames,
            graphChunkCount,
            graphError,
            semanticChunkCount,
            semanticError,
          },
          error: retrievalError,
          query: retrievalQuery,
          retrievedChunks: toTraceChunks(retrievedChunks, includeDebugTraceExcerpts),
        },
      }
    : undefined

  if (debugTrace) {
    for (const event of promptEvents) {
      applyPromptEventToTrace(debugTrace, event)
    }

    onDebugTrace?.(debugTrace)
  }

  return {
    baseInput,
    debugTrace,
    retrievalError,
    retrievalConfidence,
    retrievalDiagnostics: {
      effectiveSearchQueries: searchQueries,
      effectiveTargetDocumentNames: resolvedTargetDocumentNames,
      graphChunkCount,
      graphError,
      semanticChunkCount,
      semanticError,
    },
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
    debugTrace,
    retrievalConfidence,
    retrievalMode,
    retrievalQuery,
    retrievalQueryResult,
    retrievedChunks,
  } = await generateRagRetrievalContext({
    ...input,
    onDebugTrace: undefined,
  })

  const replyInput = {
    ...baseInput,
    retrievalIntent: retrievalQueryResult.intent,
    retrievalMode,
    retrievalQuery,
    retrievalRationale: retrievalQueryResult.rationale,
    retrievalConfidence,
    retrievedChunks,
  }
  const promptEvents: LlmDebugPromptEvent[] = []
  const replyInputWithDebug: GenerateReplyInput = {
    ...replyInput,
    onDebugPrompt: input.debugTraceEnabled ? (event) => {
      promptEvents.push(event)

      if (debugTrace) {
        applyPromptEventToTrace(debugTrace, event)
      }
    } : undefined,
  }

  if (debugTrace) {
    debugTrace.finalReplyInput = replyInput
  }

  input.onProgress?.("Composing the answer…")

  function emitFinalTrace() {
    if (!debugTrace) {
      return
    }

    for (const event of promptEvents) {
      applyPromptEventToTrace(debugTrace, event)
    }

    input.onDebugTrace?.(debugTrace)
  }

  if (input.llmClient.streamReply) {
    let reply = ""
    let hasStartedStreaming = false

    for await (const chunk of input.llmClient.streamReply(replyInputWithDebug)) {
      if (!hasStartedStreaming) {
        input.onProgress?.("Streaming the answer…")
        hasStartedStreaming = true
      }

      reply = chunk.startsWith(reply) ? chunk : `${reply}${chunk}`
      input.onToken?.(reply)
      await waitForUiFrame()
    }

    emitFinalTrace()

    return reply
  }

  const reply = await input.llmClient.generateReply(replyInputWithDebug)
  input.onToken?.(reply)
  emitFinalTrace()

  return reply
}
