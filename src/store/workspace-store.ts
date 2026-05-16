import { create } from "zustand"
import {
  addWorkspaceDocuments,
  deleteWorkspaceDocument as deleteStoredWorkspaceDocument,
  deleteWorkspace as deleteStoredWorkspace,
  getWorkspaceDocument,
  saveWorkspace,
  seedWorkspacesIfEmpty,
  type StoredWorkspaceDocument,
  updateWorkspaceDocument as updateStoredWorkspaceDocument,
} from "@/lib/chat-history/indexed-db"
import type {
  ChartPoint,
  FileProcessingStatus,
  IconKey,
  UploadedDocument,
  WorkspaceRouteConfig,
} from "@/types/dashboard"

interface FileProcessingWorkerResult {
  workspaceId: string
  documentId: string
  processingStatus: FileProcessingStatus
  errorMessage?: string
}

interface FileProcessingWorkerRequest {
  workspaceId: string
  documentId: string
  fileName: string
  fileType?: string
  mimeType?: string
  content?: ArrayBuffer
}

type FileProcessingWorkerFactory = () => Worker

interface WorkspaceStoreState {
  isLoaded: boolean
  isProcessingDocument: boolean
  workspaces: WorkspaceRouteConfig[]
  loadWorkspaces: (seedWorkspaces: WorkspaceRouteConfig[]) => Promise<void>
  createWorkspace: () => Promise<WorkspaceRouteConfig>
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  updateWorkspaceIcon: (workspaceId: string, icon: IconKey) => Promise<void>
  uploadWorkspaceFiles: (workspaceId: string, files: File[]) => Promise<void>
  processNextWorkspaceDocument: (
    workerFactory?: FileProcessingWorkerFactory
  ) => Promise<boolean>
  deleteWorkspaceDocument: (workspaceId: string, documentId: string) => Promise<void>
  deleteWorkspace: (workspaceId: string) => Promise<void>
}

function createFileProcessingWorker() {
  return new Worker(new URL("../workers/file-processing-worker.ts", import.meta.url), {
    type: "module",
  })
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function buildEmptyChartData(): ChartPoint[] {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"].map(
    (name) => ({
      name,
      growth: 0,
      reach: 0,
      intent: 0,
      signal: 0,
    })
  )
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "file"
}

function createUploadedDocument(file: File): UploadedDocument {
  return {
    id: createId(),
    name: file.name,
    type: getFileExtension(file.name),
    tone: "gray",
    size: file.size,
    uploadedAt: Date.now(),
    toBeProcessed: true,
    processingStatus: "toBeProcessed",
  }
}

async function createStoredDocument(
  workspaceId: string,
  document: UploadedDocument,
  file: File
): Promise<StoredWorkspaceDocument> {
  return {
    ...document,
    workspaceId,
    mimeType: file.type || "application/octet-stream",
    blob: file,
    content: await file.arrayBuffer(),
  }
}

function getEmptyHighlightedFile(): Pick<UploadedDocument, "name" | "tone"> {
  return {
    name: "No documents uploaded",
    tone: "blue",
  }
}

function getDocumentProcessingStatus(document: UploadedDocument) {
  return document.processingStatus ?? (document.toBeProcessed ? "toBeProcessed" : "processed")
}

function updateWorkspaceDocumentState(
  workspace: WorkspaceRouteConfig,
  documentId: string,
  processingStatus: FileProcessingStatus
) {
  return {
    ...workspace,
    uploadedDocuments: workspace.uploadedDocuments.map((document) =>
      document.id === documentId
        ? {
            ...document,
            tone: processingStatus === "processed" ? "blue" : "gray",
            toBeProcessed: processingStatus === "toBeProcessed",
            processingStatus,
          }
        : document
    ),
  } satisfies WorkspaceRouteConfig
}

function hasProcessingDocument(workspaces: WorkspaceRouteConfig[]) {
  return workspaces.some((workspace) =>
    workspace.uploadedDocuments.some(
      (document) => getDocumentProcessingStatus(document) === "processing"
    )
  )
}

function buildNewWorkspace(existingWorkspaces: WorkspaceRouteConfig[]) {
  const title = `Workspace ${existingWorkspaces.length + 1}`
  const baseId = slugify(title) || "workspace"
  let id = baseId
  let suffix = 2

  while (existingWorkspaces.some((workspace) => workspace.id === id)) {
    id = `${baseId}-${suffix}`
    suffix += 1
  }

  return {
    id,
    path: `/workspaces/${id}`,
    navLabel: title,
    navIcon: "folderKanban",
    title,
    documentCount: 0,
    documentLabel: "Documents Uploaded",
    isFavorite: false,
    tabs: [
      { id: "general", label: "General Chat", colorClass: "bg-sky-400" },
    ],
    views: [
      {
        tabId: "general",
        highlightedFile: { name: "No documents uploaded", tone: "blue" },
        initialMessages: [
          {
            id: `${id}-welcome`,
            side: "right",
            text: "This workspace is ready. Upload documents or ask a question to begin.",
          },
        ],
        chartData: buildEmptyChartData(),
      },
    ],
    uploadedDocuments: [],
  } satisfies WorkspaceRouteConfig
}

export const useWorkspaceStore = create<WorkspaceStoreState>()((set, get) => ({
  isLoaded: false,
  isProcessingDocument: false,
  workspaces: [],

  loadWorkspaces: async (seedWorkspaces) => {
    const workspaces = await seedWorkspacesIfEmpty(seedWorkspaces)
    set({ isLoaded: true, workspaces })
  },

  createWorkspace: async () => {
    const workspace = buildNewWorkspace(get().workspaces)

    await saveWorkspace(workspace)
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
    }))

    return workspace
  },

  renameWorkspace: async (workspaceId, title) => {
    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      return
    }

    const workspace = get().workspaces.find((item) => item.id === workspaceId)

    if (!workspace || workspace.title === trimmedTitle) {
      return
    }

    const renamedWorkspace = {
      ...workspace,
      title: trimmedTitle,
      navLabel: trimmedTitle,
    }

    await saveWorkspace(renamedWorkspace)
    set((state) => ({
      workspaces: state.workspaces.map((item) =>
        item.id === workspaceId ? renamedWorkspace : item
      ),
    }))
  },

  updateWorkspaceIcon: async (workspaceId, icon) => {
    const workspace = get().workspaces.find((item) => item.id === workspaceId)

    if (!workspace || workspace.navIcon === icon) {
      return
    }

    const updatedWorkspace = {
      ...workspace,
      navIcon: icon,
    }

    await saveWorkspace(updatedWorkspace)
    set((state) => ({
      workspaces: state.workspaces.map((item) =>
        item.id === workspaceId ? updatedWorkspace : item
      ),
    }))
  },

  uploadWorkspaceFiles: async (workspaceId, files) => {
    if (files.length === 0) {
      return
    }

    const workspace = get().workspaces.find((item) => item.id === workspaceId)

    if (!workspace) {
      return
    }

    const uploadedDocuments = files.map(createUploadedDocument)
    const storedDocuments = await Promise.all(
      uploadedDocuments.map((document, index) =>
        createStoredDocument(workspaceId, document, files[index])
      )
    )
    const updatedWorkspace = {
      ...workspace,
      documentCount: workspace.uploadedDocuments.length + uploadedDocuments.length,
      uploadedDocuments: [...workspace.uploadedDocuments, ...uploadedDocuments],
    }

    await addWorkspaceDocuments(storedDocuments)
    await saveWorkspace(updatedWorkspace)

    set((state) => ({
      workspaces: state.workspaces.map((item) =>
        item.id === workspaceId ? updatedWorkspace : item
      ),
    }))
  },

  processNextWorkspaceDocument: async (workerFactory) => {
    if (get().isProcessingDocument || hasProcessingDocument(get().workspaces)) {
      return false
    }

    if (!workerFactory && typeof Worker === "undefined") {
      return false
    }

    const workspace = get().workspaces.find((item) =>
      item.uploadedDocuments.some(
        (document) => getDocumentProcessingStatus(document) === "toBeProcessed"
      )
    )
    const document = workspace?.uploadedDocuments.find(
      (item) => getDocumentProcessingStatus(item) === "toBeProcessed"
    )

    if (!workspace || !document) {
      return false
    }

    const processingWorkspaceId = workspace.id
    const processingDocumentId = document.id

    const processingWorkspace = updateWorkspaceDocumentState(
      workspace,
      processingDocumentId,
      "processing"
    )

    set((state) => ({
      isProcessingDocument: true,
      workspaces: state.workspaces.map((item) =>
        item.id === processingWorkspaceId ? processingWorkspace : item
      ),
    }))

    const storedDocument = await getWorkspaceDocument(processingDocumentId)

    if (storedDocument) {
      await updateStoredWorkspaceDocument({
        ...storedDocument,
        tone: "gray",
        toBeProcessed: false,
        processingStatus: "processing",
      })
    }

    await saveWorkspace(processingWorkspace)

    const worker = workerFactory?.() ?? createFileProcessingWorker()

    async function requeueProcessingDocument() {
      const currentWorkspace = get().workspaces.find(
        (item) => item.id === processingWorkspaceId
      )

      if (!currentWorkspace) {
        set({ isProcessingDocument: false })
        return
      }

      const requeuedWorkspace = updateWorkspaceDocumentState(
        currentWorkspace,
        processingDocumentId,
        "toBeProcessed"
      )
      const currentStoredDocument = await getWorkspaceDocument(processingDocumentId)

      if (currentStoredDocument) {
        await updateStoredWorkspaceDocument({
          ...currentStoredDocument,
          tone: "gray",
          toBeProcessed: true,
          processingStatus: "toBeProcessed",
        })
      }

      await saveWorkspace(requeuedWorkspace)
      set((state) => ({
        isProcessingDocument: false,
        workspaces: state.workspaces.map((item) =>
          item.id === processingWorkspaceId ? requeuedWorkspace : item
        ),
      }))
    }

    worker.onerror = () => {
      void requeueProcessingDocument()
      worker.terminate()
    }

    worker.onmessage = async (event: MessageEvent<FileProcessingWorkerResult>) => {
      if (event.data.documentId !== processingDocumentId) {
        await requeueProcessingDocument()
        worker.terminate()
        return
      }

      if (event.data.processingStatus !== "processed") {
        await requeueProcessingDocument()
        worker.terminate()
        return
      }

      const currentWorkspace = get().workspaces.find(
        (item) => item.id === event.data.workspaceId
      )

      if (!currentWorkspace) {
        set({ isProcessingDocument: false })
        worker.terminate()
        return
      }

      const processedWorkspace = updateWorkspaceDocumentState(
        currentWorkspace,
        event.data.documentId,
        "processed"
      )
      const currentStoredDocument = await getWorkspaceDocument(event.data.documentId)

      if (currentStoredDocument) {
        await updateStoredWorkspaceDocument({
          ...currentStoredDocument,
          tone: "blue",
          toBeProcessed: false,
          processingStatus: "processed",
        })
      }

      await saveWorkspace(processedWorkspace)
      set((state) => ({
        isProcessingDocument: false,
        workspaces: state.workspaces.map((item) =>
          item.id === event.data.workspaceId ? processedWorkspace : item
        ),
      }))
      worker.terminate()
    }

    const workerRequest: FileProcessingWorkerRequest = {
      workspaceId: processingWorkspaceId,
      documentId: processingDocumentId,
      fileName: document.name,
      fileType: document.type,
      mimeType: storedDocument?.mimeType,
      content: storedDocument?.content,
    }

    if (workerRequest.content) {
      worker.postMessage(workerRequest, [workerRequest.content])
    } else {
      worker.postMessage(workerRequest)
    }

    return true
  },

  deleteWorkspaceDocument: async (workspaceId, documentId) => {
    const workspace = get().workspaces.find((item) => item.id === workspaceId)

    if (!workspace) {
      return
    }

    const documentToDelete = workspace.uploadedDocuments.find(
      (document) => document.id === documentId
    )

    if (!documentToDelete) {
      return
    }

    const uploadedDocuments = workspace.uploadedDocuments.filter(
      (document) => document.id !== documentId
    )
    const fallbackDocument = uploadedDocuments[0] ?? getEmptyHighlightedFile()
    const updatedWorkspace = {
      ...workspace,
      documentCount: uploadedDocuments.length,
      uploadedDocuments,
      views: workspace.views.map((view) =>
        view.highlightedFile.name === documentToDelete.name
          ? {
              ...view,
              highlightedFile: {
                name: fallbackDocument.name,
                tone: fallbackDocument.tone,
              },
            }
          : view
      ),
    }

    await deleteStoredWorkspaceDocument(documentId)
    await saveWorkspace(updatedWorkspace)

    set((state) => ({
      workspaces: state.workspaces.map((item) =>
        item.id === workspaceId ? updatedWorkspace : item
      ),
    }))
  },

  deleteWorkspace: async (workspaceId) => {
    await deleteStoredWorkspace(workspaceId)
    set((state) => ({
      workspaces: state.workspaces.filter(
        (workspace) => workspace.id !== workspaceId
      ),
    }))
  },
}))
