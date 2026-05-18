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
    generateRetrievalQuery: async (input) => {
      if (await chromeLocalLlm.isAvailable()) {
        return chromeLocalLlm.generateRetrievalQuery?.(input) ?? {
          intent: "Answer the latest user question.",
          retrievalMode: "semantic",
          needsDocumentSearch: true,
          searchQuery: input.prompt,
          searchQueries: [input.prompt],
        }
      }

      return {
        intent: "Answer the latest user question.",
        retrievalMode: "semantic",
        needsDocumentSearch: true,
        searchQuery: input.prompt,
        searchQueries: [input.prompt],
      }
    },
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
    streamReply: async function* (input) {
      try {
        if (await chromeLocalLlm.isAvailable() && chromeLocalLlm.streamReply) {
          yield* chromeLocalLlm.streamReply(input)
          return
        }
      } catch (error) {
        if (input.signal?.aborted) {
          throw error
        }
      }

      if (mockLlm.streamReply) {
        yield* mockLlm.streamReply(input)
        return
      }

      yield await mockLlm.generateReply(input)
    },
  }
}
