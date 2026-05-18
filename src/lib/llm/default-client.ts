import { createChromeLocalLlmClient } from "./chrome-local-llm"
import { createMockLlmClient } from "./mock-llm"
import type { GenerateReplyInput, LlmClient, RetrievalMode } from "./types"

function normalizePrompt(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function shouldSkipDocumentSearch(prompt: string) {
  return /^(ciao|salve|hey|hello|hi|buongiorno|buonasera|grazie|ok|okay|perfetto)[.!?\s]*$/.test(
    normalizePrompt(prompt)
  )
}

function inferDefaultRetrievalMode(prompt: string): RetrievalMode {
  if (shouldSkipDocumentSearch(prompt)) {
    return "none"
  }

  const normalizedPrompt = normalizePrompt(prompt)

  if (/\b(quanti|how many|lista|list|nomi|names|file|documenti|documents)\b/.test(normalizedPrompt)) {
    return "inventory"
  }

  if (/\b(relazione|relationship|collega|connected|compare|confronta|dipenden|depends|between|tra|entity|entities|tema|temi|graph|grafo)\b/.test(normalizedPrompt)) {
    return "hybrid_graph"
  }

  if (/\b(riassum|sintesi|summary|summarize|overview)\b/.test(normalizedPrompt)) {
    return "summary"
  }

  return "semantic"
}

function createDefaultRetrievalQuery(input: GenerateReplyInput) {
  const retrievalMode = inferDefaultRetrievalMode(input.prompt)

  return {
    intent: "Answer the latest user question.",
    retrievalMode,
    needsDocumentSearch: retrievalMode !== "none" && retrievalMode !== "inventory",
    searchQuery: input.prompt,
    searchQueries: [input.prompt],
  }
}

export function createDefaultLlmClient(): LlmClient {
  const chromeLocalLlm = createChromeLocalLlmClient()
  const mockLlm = createMockLlmClient()

  return {
    id: "docuchat-llm",
    label: "DocuChat LLM",
    isAvailable: async () => true,
    generateRetrievalQuery: async (input) => {
      if (await chromeLocalLlm.isAvailable()) {
        return chromeLocalLlm.generateRetrievalQuery?.(input) ?? createDefaultRetrievalQuery(input)
      }

      return createDefaultRetrievalQuery(input)
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
