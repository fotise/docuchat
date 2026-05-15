import { createChromeLocalLlmClient } from "./chrome-local-llm"
import { createMockLlmClient } from "./mock-llm"
import type { LlmClient } from "./types"

export function createDefaultLlmClient(): LlmClient {
  const chromeLocalLlm = createChromeLocalLlmClient()
  const mockLlm = createMockLlmClient()

  return {
    id: "docuchat-llm",
    label: "DocuChat LLM",
    isAvailable: async () => true,
    generateReply: async (input) => {
      try {
        if (await chromeLocalLlm.isAvailable()) {
          return await chromeLocalLlm.generateReply(input)
        }
      } catch (error) {
        if (input.signal?.aborted) {
          throw error
        }
      }

      return mockLlm.generateReply(input)
    },
  }
}
