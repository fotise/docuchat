import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { dashboardConfig } from "@/config/dashboard"
import {
  addChatMessage,
  addChatMessages,
  clearWorkspaceTabMessages,
  createStoredChatMessage,
  getRecentChatMessages,
} from "@/lib/chat-history/indexed-db"
import { copyTextToClipboard, createRagDebugTraceJson, createRagDebugTraceMarkdown } from "@/lib/chat/debug-trace"
import { generateRagReply } from "@/lib/chat/rag-chat"
import { useLlmClient } from "@/lib/llm/context"
import type { RagDebugTrace } from "@/lib/llm/types"
import { useDashboardStore } from "@/store/dashboard-store"
import type {
  HighlightedFile,
  WorkspaceMessage,
  WorkspaceRouteConfig,
  WorkspaceTabId,
} from "@/types/dashboard"
import { DocumentPill } from "./document-pill"
import { MessageBubble } from "./message-bubble"
import { TabsBar } from "./tabs-bar"

interface WorkspacePanelProps {
  workspace: WorkspaceRouteConfig
}

const EMPTY_CHAT_TABS: WorkspaceRouteConfig["tabs"] = []
const EMPTY_TAB_LABEL_OVERRIDES: Record<string, string> = {}
const EMPTY_DELETED_TABS: Record<string, boolean> = {}

function createMessage(side: "left" | "right", text: string): WorkspaceMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    side,
    text,
  }
}

export function WorkspacePanel({ workspace }: WorkspacePanelProps) {
  const [inputValue, setInputValue] = useState("")
  const [assistantProgressMessage, setAssistantProgressMessage] = useState("")
  const [captureChatDebugTrace, setCaptureChatDebugTrace] = useState(false)
  const [includeChatDebugTraceExcerpts, setIncludeChatDebugTraceExcerpts] = useState(false)
  const [lastChatDebugTrace, setLastChatDebugTrace] = useState<RagDebugTrace | null>(null)
  const [traceStatusMessage, setTraceStatusMessage] = useState("")
  const [streamingAssistantMessage, setStreamingAssistantMessage] = useState("")
  const abortControllersRef = useRef<AbortController[]>([])
  const llmClient = useLlmClient()
  const chatTabs = useDashboardStore(
    (state) => state.chatTabsByWorkspace[workspace.id]
  ) ?? EMPTY_CHAT_TABS
  const tabLabelOverrides = useDashboardStore(
    (state) => state.tabLabelOverridesByWorkspace[workspace.id]
  ) ?? EMPTY_TAB_LABEL_OVERRIDES
  const deletedTabs = useDashboardStore(
    (state) => state.deletedTabsByWorkspace[workspace.id]
  ) ?? EMPTY_DELETED_TABS
  const visibleTabs = useMemo(
    () => [
      ...workspace.tabs
        .filter((tab) => !deletedTabs[tab.id])
        .map((tab) => ({
          ...tab,
          label: tabLabelOverrides[tab.id] ?? tab.label,
        })),
      ...chatTabs.map((tab) => ({
        ...tab,
        label: tabLabelOverrides[tab.id] ?? tab.label,
      })),
    ],
    [chatTabs, deletedTabs, tabLabelOverrides, workspace.tabs]
  )

  const activeTab = useDashboardStore(
    (state) => state.activeTabByWorkspace[workspace.id] ?? visibleTabs[0]?.id ?? ""
  )
  const createChat = useDashboardStore((state) => state.createChat)
  const deleteChat = useDashboardStore((state) => state.deleteChat)
  const renameChat = useDashboardStore((state) => state.renameChat)
  const setActiveTab = useDashboardStore((state) => state.setActiveTab)
  const setMessages = useDashboardStore((state) => state.setMessages)
  const addMessage = useDashboardStore((state) => state.addMessage)
  const setReplying = useDashboardStore((state) => state.setReplying)
  const storedMessages = useDashboardStore(
    (state) => state.messagesByWorkspaceTab[workspace.id]?.[activeTab]
  )
  const isLoaded = useDashboardStore(
    (state) => !!state.loadedByWorkspaceTab[workspace.id]?.[activeTab]
  )
  const isChatCleared = useDashboardStore(
    (state) => !!state.clearedTabsByWorkspace[workspace.id]?.[activeTab]
  )
  const isReplying = useDashboardStore(
    (state) => !!state.replyingByWorkspaceTab[workspace.id]?.[activeTab]
  )
  const markChatCleared = useDashboardStore((state) => state.markChatCleared)

  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((controller) => controller.abort())
      abortControllersRef.current = []
    }
  }, [])

  const currentView = useMemo(
    () => workspace.views.find((view) => view.tabId === activeTab),
    [activeTab, workspace.views]
  )

  const activeTabLabel = useMemo(
    () => visibleTabs.find((tab) => tab.id === activeTab)?.label ?? visibleTabs[0]?.label ?? "",
    [activeTab, visibleTabs]
  )
  const highlightedFile = useMemo<HighlightedFile>(() => {
    if (currentView) {
      return currentView.highlightedFile
    }

    const firstDocument = workspace.uploadedDocuments[0]

    return {
      name: firstDocument?.name ?? "No document selected",
      tone: firstDocument?.tone ?? "gray",
    }
  }, [currentView, workspace.uploadedDocuments])
  const shouldShowDocumentPill = workspace.uploadedDocuments.some(
    (document) => document.name === highlightedFile.name
  )

  const currentMessages = storedMessages ?? (isChatCleared ? [] : currentView?.initialMessages ?? [])
  const isSendDisabled = inputValue.trim().length === 0 || isReplying
  const isAssistantWorking = isReplying || Boolean(assistantProgressMessage) || Boolean(streamingAssistantMessage)
  const replyingStatusMessage = streamingAssistantMessage
    ? assistantProgressMessage || "Streaming the answer…"
    : assistantProgressMessage || "Preparing your request…"

  useEffect(() => {
    let isMounted = true

    async function loadMessages() {
      const messages = await getRecentChatMessages(workspace.id, activeTab)

      if (!isMounted) {
        return
      }

      if (messages.length > 0) {
        setMessages(workspace.id, activeTab, messages)
        return
      }

      if (isChatCleared) {
        setMessages(workspace.id, activeTab, [])
        markChatCleared(workspace.id, activeTab)
        return
      }

      const initialMessages = currentView?.initialMessages ?? []

      await addChatMessages(
        initialMessages.map((message) => createStoredChatMessage(workspace.id, activeTab, message))
      )

      if (isMounted) {
        setMessages(workspace.id, activeTab, initialMessages)
      }
    }

    if (!isLoaded) {
      void loadMessages()
    }

    return () => {
      isMounted = false
    }
  }, [activeTab, currentView, isChatCleared, isLoaded, markChatCleared, setMessages, workspace.id])

  async function handleClearChat() {
    if (!activeTab) {
      return
    }

    abortControllersRef.current.forEach((controller) => controller.abort())
    abortControllersRef.current = []
    setMessages(workspace.id, activeTab, [])
    markChatCleared(workspace.id, activeTab)
    setReplying(workspace.id, activeTab, false)
    setAssistantProgressMessage("")
    setStreamingAssistantMessage("")
    await clearWorkspaceTabMessages(workspace.id, activeTab)
  }

  async function handleDeleteChat(tabId: WorkspaceTabId) {
    if (tabId === activeTab) {
      abortControllersRef.current.forEach((controller) => controller.abort())
      abortControllersRef.current = []
      setAssistantProgressMessage("")
      setStreamingAssistantMessage("")
    }

    deleteChat(workspace.id, tabId, workspace.tabs)
    setReplying(workspace.id, tabId, false)
    await clearWorkspaceTabMessages(workspace.id, tabId)
  }

  async function handleSend() {
    const trimmed = inputValue.trim()

    if (!trimmed || isReplying) {
      return
    }

    const tabIdAtSend: WorkspaceTabId = activeTab
    const tabLabelAtSend = activeTabLabel
    const userMessage = createMessage("left", trimmed)

    setAssistantProgressMessage("Preparing your request…")
    setStreamingAssistantMessage("")
    addMessage(workspace.id, tabIdAtSend, userMessage)
    void addChatMessage(
      createStoredChatMessage(workspace.id, tabIdAtSend, userMessage)
    )
    setInputValue("")
    setReplying(workspace.id, tabIdAtSend, true)

    const abortController = new AbortController()
    abortControllersRef.current.push(abortController)

    try {
      const assistantText = await generateRagReply({
        workspace,
        additionalQueries: workspace.additionalQueries ?? [],
        childMatchLimit: workspace.ragSearchChildMatchLimit,
        debugTraceEnabled: captureChatDebugTrace,
        graphDepth: workspace.graphSearchDepth,
        graphEntityQueries: workspace.graphEntityQueries ?? [],
        includeDebugTraceExcerpts: includeChatDebugTraceExcerpts,
        onDebugTrace: setLastChatDebugTrace,
        prompt: trimmed,
        parentChunkLimit: workspace.ragSearchParentChunkLimit,
        retrievalModeOverride: workspace.searchRetrievalMode === "auto" ? undefined : workspace.searchRetrievalMode,
        tabLabel: tabLabelAtSend,
        targetDocumentNames: workspace.targetDocumentNames ?? [],
        messages: currentMessages,
        llmClient,
        onProgress: setAssistantProgressMessage,
        onToken: setStreamingAssistantMessage,
        signal: abortController.signal,
      })

      const assistantMessage = createMessage("right", assistantText)

      setAssistantProgressMessage("Saving the answer…")
      addMessage(workspace.id, tabIdAtSend, assistantMessage)
      await addChatMessage(
        createStoredChatMessage(workspace.id, tabIdAtSend, assistantMessage)
      )
    } catch {
      if (!abortController.signal.aborted) {
        const errorMessage = createMessage(
          "right",
          "I couldn't complete that LLM request. Please try again."
        )

        addMessage(
          workspace.id,
          tabIdAtSend,
          errorMessage
        )
        await addChatMessage(
          createStoredChatMessage(workspace.id, tabIdAtSend, errorMessage)
        )
      }
    } finally {
      abortControllersRef.current = abortControllersRef.current.filter(
        (controller) => controller !== abortController
      )

      if (!abortController.signal.aborted) {
        setStreamingAssistantMessage("")
        setAssistantProgressMessage("")
        setReplying(workspace.id, tabIdAtSend, false)
      }
    }
  }

  async function handleCopyChatTrace(format: "json" | "markdown") {
    if (!lastChatDebugTrace) {
      setTraceStatusMessage("No chat debug trace captured yet.")
      return
    }

    try {
      await copyTextToClipboard(
        format === "json"
          ? createRagDebugTraceJson(lastChatDebugTrace)
          : createRagDebugTraceMarkdown(lastChatDebugTrace)
      )
      setTraceStatusMessage(`Chat debug trace copied as ${format.toUpperCase()}.`)
    } catch (error) {
      setTraceStatusMessage(error instanceof Error ? error.message : "Could not copy chat debug trace.")
    }
  }

  return (
    <Card className="h-full overflow-hidden rounded-[18px] border-white/10 bg-[linear-gradient(180deg,rgba(18,28,79,.92),rgba(12,20,58,.94))] text-white shadow-[0_10px_30px_rgba(0,0,0,.45)]">
      <div className="border-b border-white/5 bg-black/10 px-3 py-2.5">
        <TabsBar
          tabs={visibleTabs}
          value={activeTab}
          onClearChat={() => void handleClearChat()}
          onCreateChat={() => createChat(workspace.id)}
          onDeleteChat={(tabId) => void handleDeleteChat(tabId)}
          onRenameChat={(tabId, label) => renameChat(workspace.id, tabId, label)}
          onValueChange={(value) => setActiveTab(workspace.id, value)}
        />
      </div>

      <CardContent className="relative flex h-full flex-col bg-[radial-gradient(circle_at_35%_45%,rgba(46,122,255,.16),transparent_28%),radial-gradient(circle_at_75%_72%,rgba(63,255,196,.10),transparent_18%),linear-gradient(180deg,rgba(4,12,38,.35),rgba(5,11,28,.2))] p-3 md:p-5">
        <div className="pointer-events-none absolute right-24 top-28 hidden h-1 w-14 rounded-full bg-[linear-gradient(90deg,transparent,#9b68ff,#62aaff,transparent)] shadow-[0_0_18px_rgba(124,119,255,.85)] md:block" />

        {shouldShowDocumentPill ? (
          <DocumentPill
            name={highlightedFile.name}
            tone={highlightedFile.tone}
          />
        ) : null}

        {currentMessages.map((message) => (
          <MessageBubble key={message.id} side={message.side}>
            {message.text}
          </MessageBubble>
        ))}

        {isAssistantWorking ? (
          <MessageBubble side="right">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-sky-100/80">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky-100" />
                <span>{replyingStatusMessage}</span>
              </div>
              {streamingAssistantMessage ? (
                <div className="whitespace-pre-wrap text-sm font-medium leading-6 text-white">
                  {streamingAssistantMessage}
                  <span className="ml-1 animate-pulse">▍</span>
                </div>
              ) : null}
            </div>
          </MessageBubble>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <Input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleSend()
              }
            }}
            placeholder={dashboardConfig.labels.inputPlaceholder}
            className="h-11 rounded-xl border-white/10 bg-white/5 text-slate-200 placeholder:text-slate-400 focus-visible:ring-blue-500"
          />

          <Button
            onClick={() => void handleSend()}
            disabled={isSendDisabled}
            className="h-11 rounded-xl bg-gradient-to-b from-blue-400 to-blue-700 px-6 text-white hover:from-blue-400 hover:to-blue-600 disabled:opacity-60"
          >
            {dashboardConfig.labels.sendButton}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <input
              type="checkbox"
              checked={captureChatDebugTrace}
              onChange={(event) => setCaptureChatDebugTrace(event.target.checked)}
              className="h-4 w-4 accent-sky-400"
            />
            <span>Capture chat debug trace</span>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <input
              type="checkbox"
              checked={includeChatDebugTraceExcerpts}
              disabled={!captureChatDebugTrace}
              onChange={(event) => setIncludeChatDebugTraceExcerpts(event.target.checked)}
              className="h-4 w-4 accent-sky-400 disabled:opacity-50"
            />
            <span>Include excerpts</span>
          </label>
          <button
            type="button"
            disabled={!lastChatDebugTrace}
            onClick={() => void handleCopyChatTrace("json")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-bold text-slate-100 transition hover:bg-white/10 disabled:opacity-40"
          >
            Copy last chat trace JSON
          </button>
          <button
            type="button"
            disabled={!lastChatDebugTrace}
            onClick={() => void handleCopyChatTrace("markdown")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-bold text-slate-100 transition hover:bg-white/10 disabled:opacity-40"
          >
            Copy last chat trace Markdown
          </button>
          <span role="status">{traceStatusMessage}</span>
        </div>
      </CardContent>
    </Card>
  )
}