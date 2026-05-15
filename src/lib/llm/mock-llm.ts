import { buildAssistantReply } from "@/lib/mock-chat"
import type { LlmClient } from "./types"

export function createMockLlmClient(): LlmClient {
  return {
    id: "mock-llm",
    label: "Mock LLM",
    isAvailable: async () => true,
    generateReply: async ({ workspaceTitle, tabLabel, prompt }) =>
      buildAssistantReply({ workspaceTitle, tabLabel, prompt }),
  }
}
