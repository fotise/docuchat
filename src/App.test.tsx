import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LlmProvider } from "@/components/llm/llm-provider"
import { WorkspaceProvider } from "@/components/workspaces/workspace-provider"
import { clearDocuChatData } from "@/lib/chat-history/indexed-db"
import type { LlmClient } from "@/lib/llm"
import { useWorkspaceStore } from "@/store/workspace-store"
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
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </LlmProvider>
  )
}

afterEach(async () => {
  cleanup()
  localStorage.clear()
  useWorkspaceStore.setState({ isLoaded: false, workspaces: [] })
  await clearDocuChatData()
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

  it("creates a new workspace", async () => {
    renderApp()

    fireEvent.click(await screen.findByRole("button", { name: "New Workspace" }))

    expect(await screen.findAllByText("Workspace 4")).not.toHaveLength(0)
    expect(await screen.findByText("This workspace is ready. Upload documents or ask a question to begin.")).toBeTruthy()
  })

  it("renames a workspace from the header on double click", async () => {
    renderApp()

    fireEvent.doubleClick(
      await screen.findByRole("button", { name: "Rename workspace Market Research" })
    )

    const input = await screen.findByRole("textbox", { name: "Workspace name" })
    fireEvent.change(input, { target: { value: "Research Hub" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findAllByText("Research Hub")).not.toHaveLength(0)
  })

  it("renames a workspace from the sidebar on double click", async () => {
    renderApp()

    const sidebarWorkspace = (await screen.findAllByText("Market Research"))[0]
    fireEvent.doubleClick(sidebarWorkspace)

    const input = await screen.findByRole("textbox", {
      name: "Rename sidebar workspace Market Research",
    })
    fireEvent.change(input, { target: { value: "Market Lab" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findAllByText("Market Lab")).not.toHaveLength(0)
  })

  it("changes a workspace icon from the header icon peaker", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    )
    fireEvent.click(await screen.findByRole("button", { name: "Use Legal icon" }))

    expect(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    ).toHaveAttribute("aria-expanded", "false")

    await waitFor(() => {
      expect(useWorkspaceStore.getState().workspaces[0]?.navIcon).toBe("scale")
    })
  })

  it("changes a workspace icon from the sidebar icon", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Change sidebar icon for Market Research",
      })
    )
    fireEvent.click(await screen.findByRole("button", { name: "Use Business icon" }))

    await waitFor(() => {
      expect(useWorkspaceStore.getState().workspaces[0]?.navIcon).toBe("briefcase")
    })
  })

  it("keeps only one icon peaker open at a time", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    )
    expect(screen.getAllByText("Workspace icon")).toHaveLength(1)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Change sidebar icon for Market Research",
      })
    )

    expect(screen.getAllByText("Workspace icon")).toHaveLength(1)
    expect(
      screen.getByRole("button", { name: "Change icon for Market Research" })
    ).toHaveAttribute("aria-expanded", "false")
  })

  it("closes the icon peaker on Escape", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    )
    expect(screen.getByText("Workspace icon")).toBeTruthy()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByText("Workspace icon")).toBeNull()
  })

  it("closes the icon peaker on outside click", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    )
    expect(screen.getByText("Workspace icon")).toBeTruthy()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByText("Workspace icon")).toBeNull()
  })

  it("deletes an existing workspace", async () => {
    renderApp()

    expect(await screen.findAllByText("Market Research")).not.toHaveLength(0)

    fireEvent.click(await screen.findByRole("button", { name: "Delete Workspace" }))

    expect(await screen.findByRole("alertdialog", { name: "Confirm workspace deletion" })).toBeTruthy()
    expect(screen.getByText("Delete this workspace?")).toBeTruthy()
    expect(screen.getAllByText("Market Research")).not.toHaveLength(0)

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete workspace" }))

    expect(await screen.findAllByText("Legal Files")).not.toHaveLength(0)
  })
})
