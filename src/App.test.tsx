import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LlmProvider } from "@/components/llm/llm-provider"
import type { LlmClient } from "@/lib/llm"
import App from "./App"

const testLlmClient: LlmClient = {
  id: "test-llm",
  label: "Test LLM",
  isAvailable: async () => true,
  generateReply: async ({ prompt }) => `Test LLM reply for: ${prompt}`,
}

function renderApp() {
  return render(
    <LlmProvider client={testLlmClient}>
      <App />
    </LlmProvider>
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.pushState({}, "", "/")
})

describe("App", () => {
  it("redirects to the default workspace", async () => {
    renderApp()

    expect(await screen.findAllByText("Market Research")).not.toHaveLength(0)
  })

  it("announces placeholder upload controls", async () => {
    renderApp()

    fireEvent.click(await screen.findByRole("button", { name: "Upload Files" }))

    expect(screen.getByText("File upload is not connected yet.")).toBeTruthy()
  })

  it("uses the configured LLM client for chat replies", async () => {
    renderApp()

    fireEvent.change(await screen.findByPlaceholderText("Ask something about your documents..."), {
      target: { value: "Summarize the market trends" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(
      await screen.findByText("Test LLM reply for: Summarize the market trends")
    ).toBeTruthy()
  })
})
