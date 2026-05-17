import type { FileProcessingStatus, WorkspaceMessage } from "@/types/dashboard"

export interface GenerateReplyInput {
  workspaceTitle: string
  tabLabel: string
  documents: GenerateReplyDocumentInfo[]
  prompt: string
  messages: WorkspaceMessage[]
  retrievalIntent?: string
  retrievalQuery?: string
  retrievalRationale?: string
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

export interface GenerateRetrievalQueryResult {
  intent: string
  needsDocumentSearch: boolean
  searchQuery: string
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
}

export interface LlmClient {
  id: string
  label: string
  isAvailable: () => Promise<boolean>
  generateRetrievalQuery?: (
    input: GenerateRetrievalQueryInput
  ) => Promise<GenerateRetrievalQueryResult>
  generateReply: (input: GenerateReplyInput) => Promise<string>
}
