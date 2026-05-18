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
type DeletedTabsByWorkspace = Record<string, Record<string, boolean>>

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
  deletedTabsByWorkspace: DeletedTabsByWorkspace
  tabLabelOverridesByWorkspace: TabLabelOverridesByWorkspace
  messagesByWorkspaceTab: MessagesByWorkspaceTab
  loadedByWorkspaceTab: LoadedByWorkspaceTab
  replyingByWorkspaceTab: ReplyingByWorkspaceTab

  createChat: (workspaceId: string) => WorkspaceTab
  deleteChat: (
    workspaceId: string,
    tabId: WorkspaceTabId,
    baseTabs: WorkspaceTab[]
  ) => WorkspaceTabId
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

function createChatTab(existingCount: number): WorkspaceTab {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: `Chat ${existingCount + 1}`,
    colorClass: CHAT_COLOR_CLASSES[existingCount % CHAT_COLOR_CLASSES.length],
  }
}

function omitRecordKey<T>(record: Record<string, T> | undefined, key: string) {
  const rest = { ...(record ?? {}) }

  delete rest[key]

  return rest
}

export const useDashboardStore = create<DashboardStoreState>()(
  persist(
    (set, get) => ({
      activeTabByWorkspace: {},
      chatTabsByWorkspace: {},
      clearedTabsByWorkspace: {},
      deletedTabsByWorkspace: {},
      tabLabelOverridesByWorkspace: {},
      messagesByWorkspaceTab: {},
      loadedByWorkspaceTab: {},
      replyingByWorkspaceTab: {},

      createChat: (workspaceId) => {
        const existingTabs = get().chatTabsByWorkspace[workspaceId] ?? []
        const tab = createChatTab(existingTabs.length)

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

      deleteChat: (workspaceId, tabId, baseTabs) => {
        const state = get()
        const existingDynamicTabs = state.chatTabsByWorkspace[workspaceId] ?? []
        const isBaseTab = baseTabs.some((tab) => tab.id === tabId)
        const deletedBaseTabs = {
          ...(state.deletedTabsByWorkspace[workspaceId] ?? {}),
          ...(isBaseTab ? { [tabId]: true } : {}),
        }
        let nextDynamicTabs = existingDynamicTabs.filter((tab) => tab.id !== tabId)
        let remainingTabs = [
          ...baseTabs.filter((tab) => !deletedBaseTabs[tab.id]),
          ...nextDynamicTabs,
        ]

        if (remainingTabs.length === 0) {
          const fallbackTab = createChatTab(existingDynamicTabs.length)

          nextDynamicTabs = [fallbackTab]
          remainingTabs = [fallbackTab]
        }

        const currentActiveTab = state.activeTabByWorkspace[workspaceId]
        const nextActiveTab = remainingTabs.some((tab) => tab.id === currentActiveTab)
          ? currentActiveTab
          : remainingTabs[0]?.id ?? ""

        set((currentState) => ({
          activeTabByWorkspace: {
            ...currentState.activeTabByWorkspace,
            [workspaceId]: nextActiveTab,
          },
          chatTabsByWorkspace: {
            ...currentState.chatTabsByWorkspace,
            [workspaceId]: nextDynamicTabs,
          },
          clearedTabsByWorkspace: {
            ...currentState.clearedTabsByWorkspace,
            [workspaceId]: omitRecordKey(currentState.clearedTabsByWorkspace[workspaceId], tabId),
          },
          deletedTabsByWorkspace: {
            ...currentState.deletedTabsByWorkspace,
            [workspaceId]: deletedBaseTabs,
          },
          loadedByWorkspaceTab: {
            ...currentState.loadedByWorkspaceTab,
            [workspaceId]: omitRecordKey(currentState.loadedByWorkspaceTab[workspaceId], tabId),
          },
          messagesByWorkspaceTab: {
            ...currentState.messagesByWorkspaceTab,
            [workspaceId]: omitRecordKey(currentState.messagesByWorkspaceTab[workspaceId], tabId),
          },
          replyingByWorkspaceTab: {
            ...currentState.replyingByWorkspaceTab,
            [workspaceId]: omitRecordKey(currentState.replyingByWorkspaceTab[workspaceId], tabId),
          },
          tabLabelOverridesByWorkspace: {
            ...currentState.tabLabelOverridesByWorkspace,
            [workspaceId]: omitRecordKey(currentState.tabLabelOverridesByWorkspace[workspaceId], tabId),
          },
        }))

        return nextActiveTab
      },

      ensureWorkspaceInitialized: (workspace) =>
        set((state) => {
          const defaultTab = buildDefaultActiveTab(workspace)

          const existingActiveTab = state.activeTabByWorkspace[workspace.id]
          const deletedTabs = state.deletedTabsByWorkspace[workspace.id] ?? {}
          const workspaceTabs = [
            ...workspace.tabs.filter((tab) => !deletedTabs[tab.id]),
            ...(state.chatTabsByWorkspace[workspace.id] ?? []),
          ]
          const isExistingTabValid = workspaceTabs.some(
            (tab) => tab.id === existingActiveTab
          )
          const fallbackActiveTab = workspaceTabs[0]?.id ?? defaultTab

          return {
            activeTabByWorkspace: {
              ...state.activeTabByWorkspace,
              [workspace.id]: isExistingTabValid
                ? existingActiveTab
                : fallbackActiveTab,
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
          deletedTabsByWorkspace: {
            ...state.deletedTabsByWorkspace,
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
        deletedTabsByWorkspace: state.deletedTabsByWorkspace,
        tabLabelOverridesByWorkspace: state.tabLabelOverridesByWorkspace,
      }),
    }
  )
)