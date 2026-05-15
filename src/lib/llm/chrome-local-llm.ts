import type { GenerateReplyInput, LlmClient } from "./types"

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

function buildSystemPrompt({ workspaceTitle, tabLabel }: GenerateReplyInput) {
  return [
    "You are DocuChat, a concise assistant that answers questions about uploaded workspace documents.",
    `Today is : ${new Date().toLocaleDateString()}.`,
    `Workspace: ${workspaceTitle}.`,
    `Active tab: ${tabLabel}.`,
    "Answer in 2-4 sentences. Be specific, practical, and avoid mentioning that you are a browser model.",
  ].join("\n")
}

function buildUserPrompt({ prompt, messages }: GenerateReplyInput) {
  const recentMessages = messages
    .slice(-6)
    .map((message) => `${message.side === "left" ? "User" : "Assistant"}: ${message.text}`)
    .join("\n")

  return [
    recentMessages ? `Recent conversation:\n${recentMessages}` : "Recent conversation: none",
    `User request: ${prompt}`,
  ].join("\n\n")
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

      const session = await languageModel.create({
        systemPrompt: buildSystemPrompt(input),
        signal: input.signal,
      })

      try {
        return await session.prompt(buildUserPrompt(input), {
          signal: input.signal,
        })
      } finally {
        session.destroy?.()
      }
    },
  }
}
