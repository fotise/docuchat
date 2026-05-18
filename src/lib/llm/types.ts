import type { FileProcessingStatus, WorkspaceMessage } from "@/types/dashboard"

export interface GenerateReplyInput {
  workspaceTitle: string
  tabLabel: string
  documents: GenerateReplyDocumentInfo[]
  prompt: string
  messages: WorkspaceMessage[]
  retrievalIntent?: string
  retrievalMode?: RetrievalMode
  retrievalQuery?: string
  retrievalRationale?: string
  retrievalConfidence?: RetrievalConfidence
  retrievedChunks?: RetrievedContextChunk[]
  signal?: AbortSignal
}

export interface GenerateReplyDocumentInfo {
  name: string
  type: string
  size?: number
  processingStatus?: FileProcessingStatus
}

export type GenerateRetrievalQueryInput = GenerateReplyInput

export type RetrievalMode = "none" | "inventory" | "semantic" | "targeted_file" | "summary" | "graph" | "hybrid_graph"

export type RetrievalConfidence = "high" | "medium" | "low" | "none"

export interface GenerateRetrievalQueryResult {
  intent: string
  retrievalMode?: RetrievalMode
  needsDocumentSearch: boolean
  searchQuery: string
  searchQueries?: string[]
  targetDocumentNames?: string[]
  resolvedReferences?: string[]
  graphDepth?: number
  graphEntities?: string[]
  rationale?: string
}

export interface RetrievedContextChunk {
  documentId: string
  documentName?: string
  matchedChildChunkIds: string[]
  matchedQueries?: string[]
  pageNumbers: number[]
  parentChunkId: string
  score: number
  similarity: number
  text: string
  excerpt?: string
  graphEdgeTypes?: string[]
  graphEntityNames?: string[]
  keywordScore?: number
  retrievalSource?: "semantic" | "graph" | "hybrid"
  sourceScore?: number
}

export interface LlmClient {
  id: string
  label: string
  isAvailable: () => Promise<boolean>
  generateRetrievalQuery?: (
    input: GenerateRetrievalQueryInput
  ) => Promise<GenerateRetrievalQueryResult>
  generateReply: (input: GenerateReplyInput) => Promise<string>
  streamReply?: (input: GenerateReplyInput) => AsyncIterable<string>
}
