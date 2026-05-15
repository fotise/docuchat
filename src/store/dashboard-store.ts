import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
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
type ReplyingByWorkspaceTab = Record<string, Record<string, boolean>>

interface DashboardStoreState {
  activeTabByWorkspace: ActiveTabByWorkspace
  messagesByWorkspaceTab: MessagesByWorkspaceTab
  replyingByWorkspaceTab: ReplyingByWorkspaceTab

  ensureWorkspaceInitialized: (workspace: WorkspaceRouteConfig) => void
  setActiveTab: (workspaceId: string, tabId: WorkspaceTabId) => void
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
  resetWorkspaceState: (workspace: WorkspaceRouteConfig) => void
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
      replyingByWorkspaceTab: {},

      ensureWorkspaceInitialized: (workspace) =>
        set((state) => {
          const defaultTab = buildDefaultActiveTab(workspace)

          const existingActiveTab = state.activeTabByWorkspace[workspace.id]
          const isExistingTabValid = workspace.tabs.some(
            (tab) => tab.id === existingActiveTab
          )

          const initialMessages = buildInitialMessages(workspace)
          const existingMessages = state.messagesByWorkspaceTab[workspace.id] ?? {}

          return {
            activeTabByWorkspace: {
              ...state.activeTabByWorkspace,
              [workspace.id]: isExistingTabValid
                ? existingActiveTab
                : defaultTab,
            },
            messagesByWorkspaceTab: {
              ...state.messagesByWorkspaceTab,
              [workspace.id]: {
                ...initialMessages,
                ...existingMessages,
              },
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

      resetWorkspaceState: (workspace) =>
        set((state) => ({
          activeTabByWorkspace: {
            ...state.activeTabByWorkspace,
            [workspace.id]: buildDefaultActiveTab(workspace),
          },
          messagesByWorkspaceTab: {
            ...state.messagesByWorkspaceTab,
            [workspace.id]: buildInitialMessages(workspace),
          },
          replyingByWorkspaceTab: {
            ...state.replyingByWorkspaceTab,
            [workspace.id]: {},
          },
        })),
    }),
    {
      name: "docuchat-dashboard-v5",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeTabByWorkspace: state.activeTabByWorkspace,
        messagesByWorkspaceTab: state.messagesByWorkspaceTab,
      }),
    }
  )
)