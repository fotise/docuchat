import { create } from "zustand"
import {
  deleteWorkspace,
  saveWorkspace,
  seedWorkspacesIfEmpty,
} from "@/lib/chat-history/indexed-db"
import type { ChartPoint, WorkspaceRouteConfig } from "@/types/dashboard"

interface WorkspaceStoreState {
  isLoaded: boolean
  workspaces: WorkspaceRouteConfig[]
  loadWorkspaces: (seedWorkspaces: WorkspaceRouteConfig[]) => Promise<void>
  createWorkspace: () => Promise<WorkspaceRouteConfig>
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
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

  deleteWorkspace: async (workspaceId) => {
    await deleteWorkspace(workspaceId)
    set((state) => ({
      workspaces: state.workspaces.filter(
        (workspace) => workspace.id !== workspaceId
      ),
    }))
  },
}))
