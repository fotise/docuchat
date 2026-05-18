import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { replaceWorkspaceMessages } from "@/lib/chat-history/indexed-db"
import type {
  WorkspaceTab,
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
type ChatTabsByWorkspace = Record<string, WorkspaceTab[]>
type TabLabelOverridesByWorkspace = Record<string, Record<string, string>>
type ClearedTabsByWorkspace = Record<string, Record<string, boolean>>

const CHAT_COLOR_CLASSES = [
  "bg-sky-400",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-rose-400",
]

interface DashboardStoreState {
  activeTabByWorkspace: ActiveTabByWorkspace
  chatTabsByWorkspace: ChatTabsByWorkspace
  clearedTabsByWorkspace: ClearedTabsByWorkspace
  tabLabelOverridesByWorkspace: TabLabelOverridesByWorkspace
  messagesByWorkspaceTab: MessagesByWorkspaceTab
  loadedByWorkspaceTab: LoadedByWorkspaceTab
  replyingByWorkspaceTab: ReplyingByWorkspaceTab

  createChat: (workspaceId: string) => WorkspaceTab
  ensureWorkspaceInitialized: (workspace: WorkspaceRouteConfig) => void
  markChatCleared: (workspaceId: string, tabId: WorkspaceTabId) => void
  renameChat: (workspaceId: string, tabId: WorkspaceTabId, label: string) => void
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
      chatTabsByWorkspace: {},
      clearedTabsByWorkspace: {},
      tabLabelOverridesByWorkspace: {},
      messagesByWorkspaceTab: {},
      loadedByWorkspaceTab: {},
      replyingByWorkspaceTab: {},

      createChat: (workspaceId) => {
        const existingTabs = useDashboardStore.getState().chatTabsByWorkspace[workspaceId] ?? []
        const tab: WorkspaceTab = {
          id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label: `Chat ${existingTabs.length + 1}`,
          colorClass: CHAT_COLOR_CLASSES[existingTabs.length % CHAT_COLOR_CLASSES.length],
        }

        set((state) => ({
          activeTabByWorkspace: {
            ...state.activeTabByWorkspace,
            [workspaceId]: tab.id,
          },
          chatTabsByWorkspace: {
            ...state.chatTabsByWorkspace,
            [workspaceId]: [
              ...(state.chatTabsByWorkspace[workspaceId] ?? []),
              tab,
            ],
          },
          messagesByWorkspaceTab: {
            ...state.messagesByWorkspaceTab,
            [workspaceId]: {
              ...(state.messagesByWorkspaceTab[workspaceId] ?? {}),
              [tab.id]: [],
            },
          },
          loadedByWorkspaceTab: {
            ...state.loadedByWorkspaceTab,
            [workspaceId]: {
              ...(state.loadedByWorkspaceTab[workspaceId] ?? {}),
              [tab.id]: true,
            },
          },
          clearedTabsByWorkspace: {
            ...state.clearedTabsByWorkspace,
            [workspaceId]: {
              ...(state.clearedTabsByWorkspace[workspaceId] ?? {}),
              [tab.id]: true,
            },
          },
        }))

        return tab
      },

      ensureWorkspaceInitialized: (workspace) =>
        set((state) => {
          const defaultTab = buildDefaultActiveTab(workspace)

          const existingActiveTab = state.activeTabByWorkspace[workspace.id]
          const workspaceTabs = [
            ...workspace.tabs,
            ...(state.chatTabsByWorkspace[workspace.id] ?? []),
          ]
          const isExistingTabValid = workspaceTabs.some(
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

      markChatCleared: (workspaceId, tabId) =>
        set((state) => ({
          clearedTabsByWorkspace: {
            ...state.clearedTabsByWorkspace,
            [workspaceId]: {
              ...(state.clearedTabsByWorkspace[workspaceId] ?? {}),
              [tabId]: true,
            },
          },
        })),

      renameChat: (workspaceId, tabId, label) => {
        const trimmedLabel = label.trim()

        if (!trimmedLabel) {
          return
        }

        set((state) => ({
          chatTabsByWorkspace: {
            ...state.chatTabsByWorkspace,
            [workspaceId]: (state.chatTabsByWorkspace[workspaceId] ?? []).map((tab) =>
              tab.id === tabId ? { ...tab, label: trimmedLabel } : tab
            ),
          },
          tabLabelOverridesByWorkspace: {
            ...state.tabLabelOverridesByWorkspace,
            [workspaceId]: {
              ...(state.tabLabelOverridesByWorkspace[workspaceId] ?? {}),
              [tabId]: trimmedLabel,
            },
          },
        }))
      },

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
          clearedTabsByWorkspace: {
            ...state.clearedTabsByWorkspace,
            [workspaceId]: {
              ...(state.clearedTabsByWorkspace[workspaceId] ?? {}),
              [tabId]: false,
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
          clearedTabsByWorkspace: {
            ...state.clearedTabsByWorkspace,
            [workspaceId]: {
              ...(state.clearedTabsByWorkspace[workspaceId] ?? {}),
              [tabId]: false,
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
          tabLabelOverridesByWorkspace: {
            ...state.tabLabelOverridesByWorkspace,
            [workspace.id]: {},
          },
          clearedTabsByWorkspace: {
            ...state.clearedTabsByWorkspace,
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
        chatTabsByWorkspace: state.chatTabsByWorkspace,
        clearedTabsByWorkspace: state.clearedTabsByWorkspace,
        tabLabelOverridesByWorkspace: state.tabLabelOverridesByWorkspace,
      }),
    }
  )
)