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

function formatFileSize(size?: number) {
  if (typeof size !== "number") {
    return "size unknown"
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getDocumentStatusLabel(status: GenerateReplyInput["documents"][number]["processingStatus"]) {
  if (status === "processing") {
    return "processing"
  }

  if (status === "error") {
    return "error"
  }

  if (status === "toBeProcessed") {
    return "to be processed"
  }

  return "processed"
}

function buildDocumentContext(documents: GenerateReplyInput["documents"]) {
  if (documents.length === 0) {
    return "Workspace files count: 0.\nWorkspace files: none."
  }

  const fileLines = documents.map((document, index) => {
    const status = getDocumentStatusLabel(document.processingStatus)

    return `${index + 1}. ${document.name} (${document.type}, ${formatFileSize(document.size)}, ${status})`
  })

  return [
    `Workspace files count: ${documents.length}.`,
    `Workspace files (${documents.length}):`,
    ...fileLines,
  ].join("\n")
}

function buildSystemPrompt({ workspaceTitle, tabLabel, documents }: GenerateReplyInput) {
  return [
    "You are DocuChat, a concise assistant that answers questions about uploaded workspace documents.",
    `Current date: ${new Date().toLocaleDateString()}.`,
    `Workspace: ${workspaceTitle}.`,
    `Active tab: ${tabLabel}.`,
    buildDocumentContext(documents),
    "Use the workspace files list to understand what evidence may be available.",
    "For file inventory questions, such as how many files exist, file names, types, sizes, or processing status, answer directly from the workspace files list without asking for document contents.",
    "Prefer processed files. If a file is still processing or waiting to be processed, say that its contents may not be available yet.",
    "If the answer cannot be supported by the available workspace context, say what is missing instead of inventing details.",
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

function buildPrompt(input: GenerateReplyInput) {
  return [
    "System context:",
    buildSystemPrompt(input),
    "Current user request — answer this request now and give it priority over the recent conversation:",
    input.prompt,
    "Recent conversation for continuity only:",
    buildUserPrompt(input),
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

      const systemPrompt = buildSystemPrompt(input)
      const session = await languageModel.create({
        systemPrompt,
        signal: input.signal,
      })

      try {
        return await session.prompt(buildPrompt(input), {
          signal: input.signal,
        })
      } finally {
        session.destroy?.()
      }
    },
  }
}
