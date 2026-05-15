import { createContext, useContext } from "react"
import type { LlmClient } from "./types"

export const LlmContext = createContext<LlmClient | null>(null)

export function useLlmClient(): LlmClient {
  const client = useContext(LlmContext)

  if (!client) {
    throw new Error("useLlmClient must be used within LlmProvider.")
  }

  return client
}
