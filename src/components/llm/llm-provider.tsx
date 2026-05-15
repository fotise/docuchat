import type { ReactNode } from "react"
import { createDefaultLlmClient } from "@/lib/llm/default-client"
import { LlmContext } from "@/lib/llm/context"
import type { LlmClient } from "@/lib/llm/types"

const defaultClient = createDefaultLlmClient()

interface LlmProviderProps {
  children: ReactNode
  client?: LlmClient
}

export function LlmProvider({ children, client = defaultClient }: LlmProviderProps) {
  return <LlmContext.Provider value={client}>{children}</LlmContext.Provider>
}
