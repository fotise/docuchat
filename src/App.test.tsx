import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LlmProvider } from "@/components/llm/llm-provider"
import { WorkspaceProvider } from "@/components/workspaces/workspace-provider"
import {
  clearDocuChatData,
  getDocumentChunks,
  getWorkspaceDocuments,
  replaceDocumentChunks,
} from "@/lib/chat-history/indexed-db"
import { createParentChildChunks } from "@/lib/file-processing/chunking"
import {
  getFileProcessorKind,
  processPdfPipeline,
} from "@/lib/file-processing/processors"
import { createChromeLocalLlmClient } from "@/lib/llm/chrome-local-llm"
import type { LlmClient } from "@/lib/llm"
import type { GenerateReplyInput } from "@/lib/llm/types"
import { useDashboardStore } from "@/store/dashboard-store"
import { useWorkspaceStore } from "@/store/workspace-store"
import App from "./App"

let lastGenerateReplyInput: GenerateReplyInput | null = null
const FILE_PROCESSING_RESULT_MESSAGE = "docuchat:file-processing-result"

const testLlmClient: LlmClient = {
  id: "test-llm",
  label: "Test LLM",
  isAvailable: async () => true,
  generateReply: async (input) => {
    lastGenerateReplyInput = input

    if (input.prompt.toLowerCase().includes("markdown")) {
      return "**Key point**\n\n- First item\n- Second item"
    }

    return `Test LLM reply for: ${input.prompt}`
  },
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
  lastGenerateReplyInput = null
  window.LanguageModel = undefined
  localStorage.clear()
  useWorkspaceStore.setState({
    isLoaded: false,
    isProcessingDocument: false,
    workspaces: [],
  })
  useDashboardStore.setState({
    activeTabByWorkspace: {},
    messagesByWorkspaceTab: {},
    loadedByWorkspaceTab: {},
    replyingByWorkspaceTab: {},
  })
  await clearDocuChatData()
  window.history.pushState({}, "", "/")
})

describe("App", () => {
  it("redirects to the default workspace", async () => {
    renderApp()

    expect(await screen.findAllByText("Market Research")).not.toHaveLength(0)
  })

  it("opens workspace management and deletes all workspace files", async () => {
    renderApp()

    fireEvent.click(await screen.findByRole("button", { name: "Manage Workspace" }))

    expect(await screen.findByRole("dialog", { name: "Workspace management" })).toBeTruthy()
    expect(screen.getByText("Files in this workspace")).toBeTruthy()

    const managementFiles = screen.getByRole("list", {
      name: "Workspace management files",
    })
    const workspaceSummary = screen.getByLabelText("Workspace summary")

    expect(within(workspaceSummary).getByText("Files")).toBeTruthy()
    expect(within(workspaceSummary).getByText("Total size")).toBeTruthy()
    expect(within(workspaceSummary).getByText("Chunks")).toBeTruthy()
    expect(within(workspaceSummary).getByText("Pending")).toBeTruthy()

    expect(managementFiles).toHaveClass(
      "grid-cols-2",
      "sm:grid-cols-3",
      "lg:grid-cols-6",
      "max-h-[372px]",
      "overflow-y-auto"
    )
    expect(
      within(managementFiles).getByRole("button", {
        name: "Open details for Market_Overview.pdf",
      })
    ).toBeTruthy()

    fireEvent.change(screen.getByRole("searchbox", { name: "Search workspace files" }), {
      target: { value: "sales" },
    })

    expect(
      within(managementFiles).getByRole("button", {
        name: "Open details for Sales_Report.docx",
      })
    ).toBeTruthy()
    expect(
      within(managementFiles).queryByRole("button", {
        name: "Open details for Market_Overview.pdf",
      })
    ).toBeNull()

    fireEvent.change(screen.getByRole("searchbox", { name: "Search workspace files" }), {
      target: { value: "" },
    })
    fireEvent.change(screen.getByRole("combobox", { name: "Filter files by type" }), {
      target: { value: "pdf" },
    })

    expect(
      within(managementFiles).getByRole("button", {
        name: "Open details for Market_Overview.pdf",
      })
    ).toBeTruthy()
    expect(
      within(managementFiles).queryByRole("button", {
        name: "Open details for Sales_Report.docx",
      })
    ).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Delete all files" }))

    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Workspace management files" })).toBeNull()
    })

    expect(screen.getByText("No files in this workspace.")).toBeTruthy()
    expect(screen.getByText("Deleted all files from this workspace.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Open details for Market_Overview.pdf" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Close workspace management" }))

    expect(screen.queryByRole("dialog", { name: "Workspace management" })).toBeNull()
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
    expect(screen.getByText("Chunks: Unavailable")).toBeTruthy()

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
      fileName: "Process_Me.pdf",
      fileType: "pdf",
      mimeType: "application/pdf",
    })
    expect(worker.messages[0]?.transfer).toHaveLength(1)

    worker.onmessage?.({
      data: {
        type: FILE_PROCESSING_RESULT_MESSAGE,
        workspaceId: "market-research",
        documentId: processingDocument?.id,
        childChunkCount: 5,
        chunkCount: 7,
        pageCount: 2,
        parentChunkCount: 2,
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
      expect(document?.chunkCount).toBe(7)
      expect(document?.parentChunkCount).toBe(2)
      expect(document?.childChunkCount).toBe(5)
      expect(document?.pageCount).toBe(2)
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(false)

    const processedDocuments = await getWorkspaceDocuments("market-research")
    const processedDocument = processedDocuments.find(
      (document) => document.name === "Process_Me.pdf"
    )

    expect(processedDocument?.processingStatus).toBe("processed")
    expect(processedDocument?.tone).toBe("blue")
    expect(processedDocument?.chunkCount).toBe(7)
    expect(
      screen.queryByRole("progressbar", {
        name: "Market Research file processing progress",
      })
    ).toBeNull()
  })

  it("marks a file as error when worker processing fails", async () => {
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

      expect(document?.processingStatus).toBe("error")
      expect(document?.toBeProcessed).toBe(false)
      expect(document?.tone).toBe("red")
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(false)

    const storedDocuments = await getWorkspaceDocuments("market-research")
    const storedDocument = storedDocuments.find(
      (document) => document.name === "Retry_Me.pdf"
    )

    expect(storedDocument?.processingStatus).toBe("error")
    expect(storedDocument?.tone).toBe("red")
  })

  it("marks a file as error when the worker reports a failed result", async () => {
    renderApp()

    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["retry result"], "Retry_Result.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("Retry_Result.pdf")).toBeTruthy()
    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)

    const processingDocuments = await getWorkspaceDocuments("market-research")
    const processingDocument = processingDocuments.find(
      (document) => document.name === "Retry_Result.pdf"
    )

    worker.onmessage?.({
      data: {
        type: FILE_PROCESSING_RESULT_MESSAGE,
        workspaceId: "market-research",
        documentId: processingDocument?.id,
        errorMessage: "Unsupported file contents",
        processingStatus: "error",
      },
    } as MessageEvent)

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Retry_Result.pdf"
        )

      expect(document?.processingStatus).toBe("error")
      expect(document?.toBeProcessed).toBe(false)
      expect(document?.tone).toBe("red")
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(false)

    const erroredFileCard = await screen.findByRole("button", {
      name: "Open details for Retry_Result.pdf",
    })

    fireEvent.mouseEnter(erroredFileCard)

    expect(await screen.findByText("Status: Error")).toBeTruthy()
  })

  it("ignores unrelated worker messages while a file remains processing", async () => {
    renderApp()

    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["ignore me"], "Ignore_Message.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("Ignore_Message.pdf")).toBeTruthy()
    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)

    worker.onmessage?.({
      data: {
        source: "pdfjs-internal",
        status: "ready",
      },
    } as MessageEvent)

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Ignore_Message.pdf"
        )

      expect(document?.processingStatus).toBe("processing")
      expect(document?.tone).toBe("gray")
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(true)
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

  it("selects a file processor from the document extension", async () => {
    expect(getFileProcessorKind({ fileName: "Report.PDF" })).toBe("pdf")
    expect(getFileProcessorKind({ fileName: "Contract.docx" })).toBe("word")
    expect(getFileProcessorKind({ fileName: "Metrics.xlsx" })).toBe("spreadsheet")
    expect(getFileProcessorKind({ fileName: "Slides.pptx" })).toBe("presentation")
    expect(getFileProcessorKind({ fileName: "Notes.md" })).toBe("text")
    expect(getFileProcessorKind({ fileName: "Archive.zip" })).toBe("generic")
    expect(
      getFileProcessorKind({
        fileName: "download",
        fileType: "application/pdf",
        mimeType: "application/pdf",
      })
    ).toBe("pdf")
  })

  it("runs the PDF pipeline with page-aware parent child chunks in IndexedDB", async () => {
    const content = new ArrayBuffer(8)

    const result = await processPdfPipeline(
      {
        workspaceId: "market-research",
        documentId: "pdf-pipeline-test",
        fileName: "Pipeline.pdf",
        fileType: "pdf",
        mimeType: "application/pdf",
        content,
      },
      {
        childChunkOverlap: 0,
        childChunkSize: 24,
        extractTextByPage: async () => [
          {
            pageNumber: 1,
            text: "Page one explains revenue growth and retention signals.",
          },
          {
            pageNumber: 2,
            text: "Page two covers churn risk and expansion opportunities.",
          },
        ],
        generateEmbeddings: async (texts) =>
          texts.map((_, index) => ({
            dimensions: 3,
            embedding: [index, index + 0.1, index + 0.2],
            model: "test-embedding-model",
          })),
        parentChunkOverlap: 0,
        parentChunkSize: 80,
      }
    )

    expect(result).toMatchObject({
      byteLength: 8,
      childChunkCount: 6,
      embeddingCount: 6,
      pageCount: 2,
      parentChunkCount: 2,
      processor: "pdf",
    })

    const chunks = await getDocumentChunks("pdf-pipeline-test")

    expect(chunks).toHaveLength(8)
    expect(chunks[0]).toMatchObject({
      level: "parent",
      pageNumbers: [1],
      text: "Page one explains revenue growth and retention signals.",
    })
    expect(chunks[1]).toMatchObject({
      embedding: [0, 0.1, 0.2],
      embeddingDimensions: 3,
      embeddingModel: "test-embedding-model",
      level: "child",
      pageNumbers: [1],
      parentChunkId: "pdf-pipeline-test:parent:0",
    })
    expect(chunks.at(-1)).toMatchObject({
      embedding: [5, 5.1, 5.2],
      embeddingDimensions: 3,
      embeddingModel: "test-embedding-model",
      level: "child",
      pageNumbers: [2],
      parentChunkId: "pdf-pipeline-test:parent:1",
    })
  })

  it("creates configurable parent child chunks without LangChain", () => {
    const chunks = createParentChildChunks(
      [
        {
          pageNumber: 3,
          text: "Alpha section. Beta section. Gamma section.",
        },
      ],
      {
        childChunkOverlap: 0,
        childChunkSize: 10,
        idPrefix: "custom-document",
        parentChunkOverlap: 0,
        parentChunkSize: 18,
        separators: [". ", " "],
      }
    )

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toMatchObject({
      id: "custom-document:parent:0",
      pageNumbers: [3],
      text: "Alpha section.",
    })
    expect(chunks[0]?.children[0]).toMatchObject({
      id: "custom-document:child:0:0",
      parentId: "custom-document:parent:0",
      pageNumbers: [3],
    })
    expect(chunks[1]).toMatchObject({
      id: "custom-document:parent:1",
      text: "Beta section.",
    })
  })

  it("honors paragraph separators and sanitizes chunking options", () => {
    const chunks = createParentChildChunks(
      [
        {
          pageNumber: 4,
          text: "First paragraph keeps its boundary.\n\nSecond paragraph follows.",
        },
      ],
      {
        childChunkOverlap: 999,
        childChunkSize: 12,
        idPrefix: "paragraph-document",
        parentChunkOverlap: -10,
        parentChunkSize: 40,
        separators: ["\n\n", " "],
      }
    )

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({
      pageNumbers: [4],
      text: "First paragraph keeps its boundary.",
    })
    expect(chunks[1]).toMatchObject({
      pageNumbers: [4],
      text: "Second paragraph follows.",
    })
    expect(chunks[0]?.children.length).toBeGreaterThan(1)
  })

  it("opens file details and deletes a workspace file", async () => {
    renderApp()

    const file = new File(["delete me"], "Delete_Me.pdf", {
      type: "application/pdf",
    })

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: { files: [file] },
    })

    await screen.findByText("Uploaded Delete_Me.pdf to this workspace.")

    const uploadedDocument = await waitFor(async () => {
      const uploadedDocuments = await getWorkspaceDocuments("market-research")
      const document = uploadedDocuments.find(
        (workspaceDocument) => workspaceDocument.name === "Delete_Me.pdf"
      )

      expect(document).toBeTruthy()
      return document
    })

    await replaceDocumentChunks(
      "market-research",
      uploadedDocument.id,
      [
        {
          id: "delete-me:parent:0",
          workspaceId: "market-research",
          documentId: uploadedDocument.id,
          chunkId: "delete-me:parent:0",
          level: "parent" as const,
          text: "Parent chunk 1 joins market retention and revenue context.",
          pageNumbers: [1, 2],
          order: 0,
          createdAt: Date.now(),
        },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `delete-me:child:${index}`,
          workspaceId: "market-research",
          documentId: uploadedDocument.id,
          chunkId: `delete-me:child:${index}`,
          parentChunkId: "delete-me:parent:0",
          level: "child" as const,
          text: `Chunk ${index + 1} text about market retention and revenue.`,
          pageNumbers: [Math.floor(index / 4) + 1],
          embedding: [index, index + 0.25, index + 0.5, index + 0.75, index + 1],
          embeddingDimensions: 5,
          embeddingModel: "test-embedding-model",
          order: index + 1,
          createdAt: Date.now() + index + 1,
        })),
        {
          id: "delete-me:parent:1",
          workspaceId: "market-research",
          documentId: uploadedDocument.id,
          chunkId: "delete-me:parent:1",
          level: "parent" as const,
          text: "Parent chunk 2 joins expansion, churn, and planning context.",
          pageNumbers: [3],
          order: 7,
          createdAt: Date.now() + 7,
        },
        ...Array.from({ length: 6 }, (_, index) => {
          const childIndex = index + 6

          return {
            id: `delete-me:child:${childIndex}`,
            workspaceId: "market-research",
            documentId: uploadedDocument.id,
            chunkId: `delete-me:child:${childIndex}`,
            parentChunkId: "delete-me:parent:1",
            level: "child" as const,
            text: `Chunk ${childIndex + 1} text about market retention and revenue.`,
            pageNumbers: [3],
            embedding: [
              childIndex,
              childIndex + 0.25,
              childIndex + 0.5,
              childIndex + 0.75,
              childIndex + 1,
            ],
            embeddingDimensions: 5,
            embeddingModel: "test-embedding-model",
            order: childIndex + 2,
            createdAt: Date.now() + childIndex + 2,
          }
        }),
      ]
    )

    fireEvent.click(await screen.findByRole("button", { name: "Open details for Delete_Me.pdf" }))

    expect(await screen.findByRole("dialog", { name: "File details for Delete_Me.pdf" })).toBeTruthy()
    expect(screen.getByText("File details")).toBeTruthy()
    expect(screen.getAllByText("Delete_Me.pdf")).not.toHaveLength(0)
    expect(screen.getByText("9 B")).toBeTruthy()
    expect(screen.getByText("Chunks")).toBeTruthy()
    expect(screen.getAllByText("Unavailable")).not.toHaveLength(0)

    expect(await screen.findByRole("tab", { name: "Parent chunks (2)" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Chunks (12)" })).toBeTruthy()
    expect(await screen.findByRole("table", { name: "Parent chunks table" })).toBeTruthy()
    expect(screen.getByText("delete-me:parent:0")).toBeTruthy()
    expect(screen.getByText("delete-me:parent:1")).toBeTruthy()
    expect(screen.getAllByText("6")).not.toHaveLength(0)

    fireEvent.click(screen.getByRole("tab", { name: "Chunks (12)" }))

    expect(await screen.findByRole("table", { name: "Child chunks table" })).toBeTruthy()
    expect(await screen.findByText("Showing 1-10 of 12 chunks")).toBeTruthy()
    expect(screen.getByText("delete-me:child:0")).toBeTruthy()
    expect(screen.getByText("delete-me:child:9")).toBeTruthy()
    expect(screen.queryByText("delete-me:child:10")).toBeNull()
    expect(screen.getAllByText("test-embedding-model")).toHaveLength(10)
    expect(screen.getByText("[0.000, 0.250, 0.500, 0.750, …]")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Next chunks page" }))

    expect(await screen.findByText("Showing 11-12 of 12 chunks")).toBeTruthy()
    expect(screen.getByText("delete-me:child:10")).toBeTruthy()
    expect(screen.getByText("delete-me:child:11")).toBeTruthy()
    expect(screen.queryByText("delete-me:child:9")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Reprocess Delete_Me.pdf" }))

    await waitFor(async () => {
      expect(await getDocumentChunks(uploadedDocument.id)).toHaveLength(0)
    })

    await waitFor(async () => {
      const storedDocuments = await getWorkspaceDocuments("market-research")
      const storedDocument = storedDocuments.find(
        (workspaceDocument) => workspaceDocument.id === uploadedDocument.id
      )

      expect(storedDocument).toMatchObject({
        processingStatus: "toBeProcessed",
        toBeProcessed: true,
        tone: "gray",
      })
      expect(storedDocument?.chunkCount).toBeUndefined()
      expect(storedDocument?.childChunkCount).toBeUndefined()
      expect(storedDocument?.parentChunkCount).toBeUndefined()
      expect(storedDocument?.pageCount).toBeUndefined()
    })

    expect(await screen.findByText("The table will populate after file processing completes.")).toBeTruthy()
    expect(screen.getByText("Delete_Me.pdf is queued for reprocessing.")).toBeTruthy()
    expect(screen.queryByText("delete-me:child:10")).toBeNull()

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
    expect(lastGenerateReplyInput?.workspaceTitle).toBe("Market Research")
    expect(lastGenerateReplyInput?.documents[0]).toMatchObject({
      name: "Market_Overview.pdf",
      type: "pdf",
    })
  })

  it("renders LLM replies as markdown", async () => {
    renderApp()

    fireEvent.change(await screen.findByPlaceholderText("Ask something about your documents..."), {
      target: { value: "Return markdown" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(await screen.findByText("Key point")).toBeTruthy()
    expect(await screen.findByText("First item")).toBeTruthy()
    expect(screen.getByText("Key point").tagName).toBe("STRONG")
    expect(screen.getByText("First item").closest("li")).toBeTruthy()
    expect(screen.getByText("Key point").closest(".app-scrollbar")).toHaveClass(
      "overflow-x-auto"
    )
  })

  it("adds workspace date and file context to the Chrome local LLM system prompt", async () => {
    let systemPrompt = ""
    let promptPayload = ""

    window.LanguageModel = {
      availability: async () => "available",
      create: async (options) => {
        systemPrompt = options?.systemPrompt ?? ""

        return {
          prompt: async (input) => {
            promptPayload = input
            return "Chrome local reply"
          },
        }
      },
    }

    const client = createChromeLocalLlmClient()
    const reply = await client.generateReply({
      workspaceTitle: "Research Hub",
      tabLabel: "Contracts",
      documents: [
        {
          name: "Agreement.pdf",
          type: "pdf",
          size: 2048,
          processingStatus: "processed",
        },
        {
          name: "Survey.csv",
          type: "csv",
          size: 512,
          processingStatus: "toBeProcessed",
        },
      ],
      prompt: "Summarize the files",
      messages: [],
    })

    expect(reply).toBe("Chrome local reply")
    expect(systemPrompt).toContain("Current date:")
    expect(systemPrompt).toContain("Workspace: Research Hub.")
    expect(systemPrompt).toContain("Active tab: Contracts.")
    expect(systemPrompt).toContain("Workspace files count: 2.")
    expect(systemPrompt).toContain("Workspace files (2):")
    expect(systemPrompt).toContain("1. Agreement.pdf (pdf, 2.0 KB, processed)")
    expect(systemPrompt).toContain("2. Survey.csv (csv, 512 B, to be processed)")
    expect(systemPrompt).toContain("For file inventory questions")
    expect(systemPrompt).toContain("Prefer processed files.")
    expect(systemPrompt).toContain("say what is missing instead of inventing details")
    expect(promptPayload).toContain("System context:")
    expect(promptPayload).toContain("Workspace: Research Hub.")
    expect(promptPayload).toContain("Workspace files count: 2.")
    expect(promptPayload).toContain("Workspace files (2):")
    expect(promptPayload).toContain("Current user request — answer this request now")
    expect(promptPayload).toContain("Recent conversation for continuity only:")
    expect(promptPayload).toContain("User request: Summarize the files")
  })

  it("prioritizes file inventory context for file count questions", async () => {
    let promptPayload = ""

    window.LanguageModel = {
      availability: async () => "available",
      create: async () => ({
        prompt: async (input) => {
          promptPayload = input
          return "Hai 2 file nel workspace corrente."
        },
      }),
    }

    const client = createChromeLocalLlmClient()
    const reply = await client.generateReply({
      workspaceTitle: "Vendor Notes",
      tabLabel: "General Chat",
      documents: [
        {
          name: "Vendor_Notes.pdf",
          type: "pdf",
          size: 1024,
          processingStatus: "processed",
        },
        {
          name: "Budget.xlsx",
          type: "xlsx",
          size: 4096,
          processingStatus: "processed",
        },
      ],
      prompt: "Quanti file ho?",
      messages: [
        {
          id: "previous-user",
          side: "left",
          text: "Summarize the vendor notes.",
        },
        {
          id: "previous-assistant",
          side: "right",
          text: "Please provide the vendor notes.",
        },
      ],
    })

    expect(reply).toBe("Hai 2 file nel workspace corrente.")
    expect(promptPayload).toContain("Workspace files count: 2.")
    expect(promptPayload).toContain("Current user request — answer this request now")
    expect(promptPayload.indexOf("Quanti file ho?")).toBeLessThan(
      promptPayload.indexOf("Recent conversation for continuity only:")
    )
    expect(promptPayload).toContain(
      "answer directly from the workspace files list without asking for document contents"
    )
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
