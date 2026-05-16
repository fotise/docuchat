import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LlmProvider } from "@/components/llm/llm-provider"
import { WorkspaceProvider } from "@/components/workspaces/workspace-provider"
import {
  clearDocuChatData,
  getWorkspaceDocuments,
} from "@/lib/chat-history/indexed-db"
import type { LlmClient } from "@/lib/llm"
import { useWorkspaceStore } from "@/store/workspace-store"
import App from "./App"

const testLlmClient: LlmClient = {
  id: "test-llm",
  label: "Test LLM",
  isAvailable: async () => true,
  generateReply: async ({ prompt }) => `Test LLM reply for: ${prompt}`,
}

function createControlledProcessingWorker() {
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    messages: [] as Array<{ message: unknown; transfer?: Transferable[] }>,
    postMessage(message: unknown, transfer?: Transferable[]) {
      this.messages.push({ message, transfer })
    },
    terminate: () => {},
  }

  return worker
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
  useWorkspaceStore.setState({
    isLoaded: false,
    isProcessingDocument: false,
    workspaces: [],
  })
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

    fireEvent.click(await screen.findByRole("button", { name: "Manage Workspace" }))

    expect(screen.getByText("Workspace document management is not connected yet.")).toBeTruthy()
  })

  it("renders fixed file cards with ellipsis, tooltip details, and a scrollable list", async () => {
    renderApp()

    const filesList = await screen.findByRole("list", { name: "Workspace files" })
    const fileCard = await screen.findByRole("button", {
      name: "Open details for Market_Overview.pdf",
    })

    expect(filesList).toHaveClass("app-scrollbar", "max-h-[354px]", "overflow-y-auto")
    expect(fileCard).toHaveClass("h-28", "w-full")
    expect(fileCard.querySelector("div.truncate")).toBeTruthy()
    expect(fileCard).not.toHaveAttribute("title")

    fireEvent.mouseEnter(fileCard)

    expect(await screen.findByRole("tooltip")).toHaveClass("fixed", "z-[9999]")
    expect(screen.getByText("Name: Market_Overview.pdf")).toBeTruthy()
    expect(screen.getByText("Size: Size unavailable")).toBeTruthy()
    expect(screen.getByText("Status: Processed")).toBeTruthy()

    fireEvent.scroll(filesList)

    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("keeps only one file tooltip open at a time", async () => {
    renderApp()

    const firstFileCard = await screen.findByRole("button", {
      name: "Open details for Market_Overview.pdf",
    })
    const secondFileCard = await screen.findByRole("button", {
      name: "Open details for Sales_Report.docx",
    })

    fireEvent.mouseEnter(firstFileCard)

    expect(await screen.findByRole("tooltip")).toBeTruthy()
    expect(screen.getByText("Name: Market_Overview.pdf")).toBeTruthy()

    fireEvent.mouseEnter(secondFileCard)

    expect(screen.getAllByRole("tooltip")).toHaveLength(1)
    expect(screen.queryByText("Name: Market_Overview.pdf")).toBeNull()
    expect(screen.getByText("Name: Sales_Report.docx")).toBeTruthy()
  })

  it("uploads workspace files into IndexedDB", async () => {
    renderApp()

    const file = new File(["quarterly revenue"], "Quarterly_Report.pdf", {
      type: "application/pdf",
    })

    expect(
      screen.queryByRole("progressbar", {
        name: "Market Research file processing progress",
      })
    ).toBeNull()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: { files: [file] },
    })

    expect(await screen.findByText("Quarterly_Report.pdf")).toBeTruthy()
    expect(await screen.findByText("Uploaded Quarterly_Report.pdf to this workspace.")).toBeTruthy()
    expect(
      await screen.findByRole("button", {
        name: "Open details for Quarterly_Report.pdf",
      })
    ).not.toHaveAttribute("title")

    const storedDocuments = await getWorkspaceDocuments("market-research")
    const storedDocument = storedDocuments.find(
      (document) => document.name === "Quarterly_Report.pdf"
    )

    expect(storedDocument?.mimeType).toBe("application/pdf")
    expect(storedDocument?.content.byteLength).toBe(file.size)
    expect(storedDocument?.toBeProcessed).toBe(true)
    expect(storedDocument?.tone).toBe("gray")
    expect(storedDocument?.processingStatus).toBe("toBeProcessed")

    expect(
      await screen.findByRole("progressbar", {
        name: "Market Research file processing progress",
      })
    ).toHaveAttribute("aria-valuenow", "86")
  })

  it("shows gray pending progress when every workspace file needs processing", async () => {
    renderApp()

    fireEvent.click(await screen.findByRole("button", { name: "New Workspace" }))
    expect(await screen.findByText("This workspace is ready. Upload documents or ask a question to begin.")).toBeTruthy()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["pending"], "Pending_Report.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(
      await screen.findByRole("progressbar", {
        name: "Workspace 4 file processing progress",
      })
    ).toHaveAttribute("aria-valuenow", "0")
  })

  it("processes a pending workspace file with a worker", async () => {
    renderApp()

    const file = new File(["process me"], "Process_Me.pdf", {
      type: "application/pdf",
    })
    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: { files: [file] },
    })

    expect(await screen.findByText("Process_Me.pdf")).toBeTruthy()

    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Process_Me.pdf"
        )

      expect(document?.processingStatus).toBe("processing")
    })

    const processingDocuments = await getWorkspaceDocuments("market-research")
    const processingDocument = processingDocuments.find(
      (document) => document.name === "Process_Me.pdf"
    )

    expect(processingDocument?.processingStatus).toBe("processing")
    expect(worker.messages).toHaveLength(1)
    expect(worker.messages[0]?.message).toMatchObject({
      workspaceId: "market-research",
      documentId: processingDocument?.id,
    })
    expect(worker.messages[0]?.transfer).toHaveLength(1)

    worker.onmessage?.({
      data: {
        workspaceId: "market-research",
        documentId: processingDocument?.id,
        processingStatus: "processed",
      },
    } as MessageEvent)

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Process_Me.pdf"
        )

      expect(document?.processingStatus).toBe("processed")
      expect(document?.toBeProcessed).toBe(false)
      expect(document?.tone).toBe("blue")
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(false)

    const processedDocuments = await getWorkspaceDocuments("market-research")
    const processedDocument = processedDocuments.find(
      (document) => document.name === "Process_Me.pdf"
    )

    expect(processedDocument?.processingStatus).toBe("processed")
    expect(processedDocument?.tone).toBe("blue")
    expect(
      screen.queryByRole("progressbar", {
        name: "Market Research file processing progress",
      })
    ).toBeNull()
  })

  it("requeues a file when worker processing fails", async () => {
    renderApp()

    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["retry"], "Retry_Me.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("Retry_Me.pdf")).toBeTruthy()
    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)

    worker.onerror?.(new Event("error"))

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Retry_Me.pdf"
        )

      expect(document?.processingStatus).toBe("toBeProcessed")
      expect(document?.toBeProcessed).toBe(true)
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(false)
  })

  it("does not start another worker while a file is processing", async () => {
    renderApp()

    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["first"], "First_Pending.pdf", {
            type: "application/pdf",
          }),
          new File(["second"], "Second_Pending.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("First_Pending.pdf")).toBeTruthy()
    expect(await screen.findByText("Second_Pending.pdf")).toBeTruthy()

    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)
    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => createControlledProcessingWorker() as unknown as Worker)
    ).toBe(false)

    const documents = useWorkspaceStore.getState().workspaces[0]?.uploadedDocuments ?? []

    expect(
      documents.filter((document) => document.processingStatus === "processing")
    ).toHaveLength(1)
    expect(
      documents.filter((document) => document.processingStatus === "toBeProcessed")
    ).toHaveLength(1)
  })

  it("opens file details and deletes a workspace file", async () => {
    renderApp()

    const file = new File(["delete me"], "Delete_Me.pdf", {
      type: "application/pdf",
    })

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: { files: [file] },
    })

    fireEvent.click(await screen.findByRole("button", { name: "Open details for Delete_Me.pdf" }))

    expect(await screen.findByRole("dialog", { name: "File details for Delete_Me.pdf" })).toBeTruthy()
    expect(screen.getByText("File details")).toBeTruthy()
    expect(screen.getAllByText("Delete_Me.pdf")).not.toHaveLength(0)
    expect(screen.getByText("9 B")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Close file details" }))

    expect(screen.queryByRole("dialog", { name: "File details for Delete_Me.pdf" })).toBeNull()

    fireEvent.click(await screen.findByRole("button", { name: "Open details for Delete_Me.pdf" }))

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByRole("dialog", { name: "File details for Delete_Me.pdf" })).toBeNull()

    fireEvent.click(await screen.findByRole("button", { name: "Open details for Delete_Me.pdf" }))
    fireEvent.click(await screen.findByRole("button", { name: "Delete Delete_Me.pdf" }))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Open details for Delete_Me.pdf" })).toBeNull()
    })

    const storedDocuments = await getWorkspaceDocuments("market-research")

    expect(
      storedDocuments.some((document) => document.name === "Delete_Me.pdf")
    ).toBe(false)
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

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["cascade"], "Cascade_Delete.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("Cascade_Delete.pdf")).toBeTruthy()

    fireEvent.click(await screen.findByRole("button", { name: "Delete Workspace" }))

    expect(await screen.findByRole("alertdialog", { name: "Confirm workspace deletion" })).toBeTruthy()
    expect(screen.getByText("Delete this workspace?")).toBeTruthy()
    expect(screen.getAllByText("Market Research")).not.toHaveLength(0)

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete workspace" }))

    expect(await screen.findAllByText("Legal Files")).not.toHaveLength(0)

    await waitFor(async () => {
      const storedDocuments = await getWorkspaceDocuments("market-research")

      expect(
        storedDocuments.some((document) => document.name === "Cascade_Delete.pdf")
      ).toBe(false)
    })
  })
})
