import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { dashboardConfig } from "@/config/dashboard"
import {
  addChatMessage,
  addChatMessages,
  createStoredChatMessage,
  getRecentChatMessages,
} from "@/lib/chat-history/indexed-db"
import { useLlmClient } from "@/lib/llm/context"
import { useDashboardStore } from "@/store/dashboard-store"
import type {
  WorkspaceMessage,
  WorkspaceRouteConfig,
  WorkspaceTabId,
} from "@/types/dashboard"
import { DocumentPill } from "./document-pill"
import { MainChart } from "./main-chart"
import { MessageBubble } from "./message-bubble"
import { TabsBar } from "./tabs-bar"

interface WorkspacePanelProps {
  workspace: WorkspaceRouteConfig
}

function createMessage(side: "left" | "right", text: string): WorkspaceMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    side,
    text,
  }
}

export function WorkspacePanel({ workspace }: WorkspacePanelProps) {
  const [inputValue, setInputValue] = useState("")
  const abortControllersRef = useRef<AbortController[]>([])
  const llmClient = useLlmClient()

  const activeTab = useDashboardStore(
    (state) => state.activeTabByWorkspace[workspace.id] ?? workspace.tabs[0]?.id ?? ""
  )
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
  const isReplying = useDashboardStore(
    (state) => !!state.replyingByWorkspaceTab[workspace.id]?.[activeTab]
  )

  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((controller) => controller.abort())
      abortControllersRef.current = []
    }
  }, [])

  const currentView = useMemo(
    () => workspace.views.find((view) => view.tabId === activeTab) ?? workspace.views[0],
    [activeTab, workspace.views]
  )

  const activeTabLabel = useMemo(
    () => workspace.tabs.find((tab) => tab.id === activeTab)?.label ?? workspace.tabs[0]?.label ?? "",
    [activeTab, workspace.tabs]
  )

  const currentMessages = storedMessages ?? currentView.initialMessages
  const isSendDisabled = inputValue.trim().length === 0 || isReplying

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

      await addChatMessages(
        currentView.initialMessages.map((message) =>
          createStoredChatMessage(workspace.id, activeTab, message)
        )
      )

      if (isMounted) {
        setMessages(workspace.id, activeTab, currentView.initialMessages)
      }
    }

    if (!isLoaded) {
      void loadMessages()
    }

    return () => {
      isMounted = false
    }
  }, [activeTab, currentView.initialMessages, isLoaded, setMessages, workspace.id])

  async function handleSend() {
    const trimmed = inputValue.trim()

    if (!trimmed || isReplying) {
      return
    }

    const tabIdAtSend: WorkspaceTabId = activeTab
    const tabLabelAtSend = activeTabLabel
    const userMessage = createMessage("left", trimmed)

    addMessage(workspace.id, tabIdAtSend, userMessage)
    void addChatMessage(
      createStoredChatMessage(workspace.id, tabIdAtSend, userMessage)
    )
    setInputValue("")
    setReplying(workspace.id, tabIdAtSend, true)

    const abortController = new AbortController()
    abortControllersRef.current.push(abortController)

    try {
      const assistantText = await llmClient.generateReply({
        workspaceTitle: workspace.title,
        tabLabel: tabLabelAtSend,
        documents: workspace.uploadedDocuments.map((document) => ({
          name: document.name,
          type: document.type,
          size: document.size,
          processingStatus: document.processingStatus,
        })),
        prompt: trimmed,
        messages: currentMessages,
        signal: abortController.signal,
      })

      const assistantMessage = createMessage("right", assistantText)

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
        setReplying(workspace.id, tabIdAtSend, false)
      }
    }
  }

  return (
    <Card className="h-full overflow-hidden rounded-[18px] border-white/10 bg-[linear-gradient(180deg,rgba(18,28,79,.92),rgba(12,20,58,.94))] text-white shadow-[0_10px_30px_rgba(0,0,0,.45)]">
      <div className="border-b border-white/5 bg-black/10 px-3 py-2.5">
        <TabsBar
          tabs={workspace.tabs}
          value={activeTab}
          onValueChange={(value) => setActiveTab(workspace.id, value)}
        />
      </div>

      <CardContent className="relative flex h-full flex-col bg-[radial-gradient(circle_at_35%_45%,rgba(46,122,255,.16),transparent_28%),radial-gradient(circle_at_75%_72%,rgba(63,255,196,.10),transparent_18%),linear-gradient(180deg,rgba(4,12,38,.35),rgba(5,11,28,.2))] p-3 md:p-5">
        <div className="pointer-events-none absolute right-24 top-28 hidden h-1 w-14 rounded-full bg-[linear-gradient(90deg,transparent,#9b68ff,#62aaff,transparent)] shadow-[0_0_18px_rgba(124,119,255,.85)] md:block" />

        <DocumentPill
          name={currentView.highlightedFile.name}
          tone={currentView.highlightedFile.tone}
        />

        {currentMessages.map((message) => (
          <MessageBubble key={message.id} side={message.side}>
            {message.text}
          </MessageBubble>
        ))}

        {isReplying ? (
          <MessageBubble side="right">
            {dashboardConfig.labels.assistantTyping}
          </MessageBubble>
        ) : null}

        <MainChart
          data={currentView.chartData}
          series={dashboardConfig.chartSeries}
        />

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
      </CardContent>
    </Card>
  )
}