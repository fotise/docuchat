import { create } from "zustand"
import {
  addWorkspaceDocuments,
  deleteWorkspaceDocument as deleteStoredWorkspaceDocument,
  deleteWorkspace as deleteStoredWorkspace,
  saveWorkspace,
  seedWorkspacesIfEmpty,
  type StoredWorkspaceDocument,
} from "@/lib/chat-history/indexed-db"
import type {
  ChartPoint,
  IconKey,
  UploadedDocument,
  WorkspaceRouteConfig,
} from "@/types/dashboard"

interface WorkspaceStoreState {
  isLoaded: boolean
  workspaces: WorkspaceRouteConfig[]
  loadWorkspaces: (seedWorkspaces: WorkspaceRouteConfig[]) => Promise<void>
  createWorkspace: () => Promise<WorkspaceRouteConfig>
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  updateWorkspaceIcon: (workspaceId: string, icon: IconKey) => Promise<void>
  uploadWorkspaceFiles: (workspaceId: string, files: File[]) => Promise<void>
  deleteWorkspaceDocument: (workspaceId: string, documentId: string) => Promise<void>
  deleteWorkspace: (workspaceId: string) => Promise<void>
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
