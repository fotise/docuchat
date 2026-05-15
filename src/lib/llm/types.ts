import type { WorkspaceMessage } from "@/types/dashboard"

export interface GenerateReplyInput {
  workspaceTitle: string
  tabLabel: string
  prompt: string
  messages: WorkspaceMessage[]
  signal?: AbortSignal
}

export interface LlmClient {
  id: string
  label: string
  isAvailable: () => Promise<boolean>
  generateReply: (input: GenerateReplyInput) => Promise<string>
}
