import type { FileProcessingStatus, WorkspaceMessage } from "@/types/dashboard"

export interface GenerateReplyInput {
  workspaceTitle: string
  tabLabel: string
  documents: GenerateReplyDocumentInfo[]
  prompt: string
  messages: WorkspaceMessage[]
  signal?: AbortSignal
}

export interface GenerateReplyDocumentInfo {
  name: string
  type: string
  size?: number
  processingStatus?: FileProcessingStatus
}
export interface LlmClient {
  id: string
  label: string
  isAvailable: () => Promise<boolean>
  generateReply: (input: GenerateReplyInput) => Promise<string>
}
