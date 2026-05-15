import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { replaceWorkspaceMessages } from "@/lib/chat-history/indexed-db"
import type {
  WorkspaceMessage,
  WorkspaceRouteConfig,
  WorkspaceTabId,
} from "@/types/dashboard"

type ActiveTabByWorkspace = Record<string, WorkspaceTabId>
type MessagesByWorkspaceTab = Record<
  string,
  Record<string, WorkspaceMessage[]>
>
type LoadedByWorkspaceTab = Record<string, Record<string, boolean>>
type ReplyingByWorkspaceTab = Record<string, Record<string, boolean>>

interface DashboardStoreState {
  activeTabByWorkspace: ActiveTabByWorkspace
  messagesByWorkspaceTab: MessagesByWorkspaceTab
  loadedByWorkspaceTab: LoadedByWorkspaceTab
  replyingByWorkspaceTab: ReplyingByWorkspaceTab

  ensureWorkspaceInitialized: (workspace: WorkspaceRouteConfig) => void
  setActiveTab: (workspaceId: string, tabId: WorkspaceTabId) => void
  setMessages: (
    workspaceId: string,
    tabId: WorkspaceTabId,
    messages: WorkspaceMessage[]
  ) => void
  addMessage: (
    workspaceId: string,
    tabId: WorkspaceTabId,
    message: WorkspaceMessage
  ) => void
  setReplying: (
    workspaceId: string,
    tabId: WorkspaceTabId,
    value: boolean
  ) => void
  resetWorkspaceState: (workspace: WorkspaceRouteConfig) => Promise<void>
}

function buildInitialMessages(
  workspace: WorkspaceRouteConfig
): Record<WorkspaceTabId, WorkspaceMessage[]> {
  return workspace.views.reduce(
    (acc, view) => {
      acc[view.tabId] = [...view.initialMessages]
      return acc
    },
    {} as Record<WorkspaceTabId, WorkspaceMessage[]>
  )
}

function buildDefaultActiveTab(workspace: WorkspaceRouteConfig): WorkspaceTabId {
  return workspace.tabs[0]?.id ?? ""
}

export const useDashboardStore = create<DashboardStoreState>()(
  persist(
    (set) => ({
      activeTabByWorkspace: {},
      messagesByWorkspaceTab: {},
      loadedByWorkspaceTab: {},
      replyingByWorkspaceTab: {},

      ensureWorkspaceInitialized: (workspace) =>
        set((state) => {
          const defaultTab = buildDefaultActiveTab(workspace)

          const existingActiveTab = state.activeTabByWorkspace[workspace.id]
          const isExistingTabValid = workspace.tabs.some(
            (tab) => tab.id === existingActiveTab
          )

          return {
            activeTabByWorkspace: {
              ...state.activeTabByWorkspace,
              [workspace.id]: isExistingTabValid
                ? existingActiveTab
                : defaultTab,
            },
            replyingByWorkspaceTab: {
              ...state.replyingByWorkspaceTab,
              [workspace.id]: state.replyingByWorkspaceTab[workspace.id] ?? {},
            },
          }
        }),

      setActiveTab: (workspaceId, tabId) =>
        set((state) => ({
          activeTabByWorkspace: {
            ...state.activeTabByWorkspace,
            [workspaceId]: tabId,
          },
        })),

      setMessages: (workspaceId, tabId, messages) =>
        set((state) => ({
          messagesByWorkspaceTab: {
            ...state.messagesByWorkspaceTab,
            [workspaceId]: {
              ...(state.messagesByWorkspaceTab[workspaceId] ?? {}),
              [tabId]: messages,
            },
          },
          loadedByWorkspaceTab: {
            ...state.loadedByWorkspaceTab,
            [workspaceId]: {
              ...(state.loadedByWorkspaceTab[workspaceId] ?? {}),
              [tabId]: true,
            },
          },
        })),

      addMessage: (workspaceId, tabId, message) =>
        set((state) => ({
          messagesByWorkspaceTab: {
            ...state.messagesByWorkspaceTab,
            [workspaceId]: {
              ...(state.messagesByWorkspaceTab[workspaceId] ?? {}),
              [tabId]: [
                ...((state.messagesByWorkspaceTab[workspaceId]?.[tabId] ?? [])),
                message,
              ],
            },
          },
          loadedByWorkspaceTab: {
            ...state.loadedByWorkspaceTab,
            [workspaceId]: {
              ...(state.loadedByWorkspaceTab[workspaceId] ?? {}),
              [tabId]: true,
            },
          },
        })),

      setReplying: (workspaceId, tabId, value) =>
        set((state) => ({
          replyingByWorkspaceTab: {
            ...state.replyingByWorkspaceTab,
            [workspaceId]: {
              ...(state.replyingByWorkspaceTab[workspaceId] ?? {}),
              [tabId]: value,
            },
          },
        })),

      resetWorkspaceState: async (workspace) => {
        const initialMessages = buildInitialMessages(workspace)

        await replaceWorkspaceMessages(workspace.id, initialMessages)

        set((state) => ({
          activeTabByWorkspace: {
            ...state.activeTabByWorkspace,
            [workspace.id]: buildDefaultActiveTab(workspace),
          },
          messagesByWorkspaceTab: {
            ...state.messagesByWorkspaceTab,
            [workspace.id]: initialMessages,
          },
          loadedByWorkspaceTab: {
            ...state.loadedByWorkspaceTab,
            [workspace.id]: workspace.views.reduce(
              (acc, view) => {
                acc[view.tabId] = true
                return acc
              },
              {} as Record<WorkspaceTabId, boolean>
            ),
          },
          replyingByWorkspaceTab: {
            ...state.replyingByWorkspaceTab,
            [workspace.id]: {},
          },
        }))
      },
    }),
    {
      name: "docuchat-dashboard-v6",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeTabByWorkspace: state.activeTabByWorkspace,
      }),
    }
  )
)