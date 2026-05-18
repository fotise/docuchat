import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { WorkspaceTab, WorkspaceTabId } from "@/types/dashboard"

interface TabsBarProps {
  tabs: WorkspaceTab[]
  value: WorkspaceTabId
  onClearChat?: () => void
  onCreateChat?: () => void
  onDeleteChat?: (tabId: WorkspaceTabId) => void
  onRenameChat?: (tabId: WorkspaceTabId, label: string) => void
  onValueChange: (value: string) => void
}

export function TabsBar({
  tabs,
  value,
  onClearChat,
  onCreateChat,
  onDeleteChat,
  onRenameChat,
  onValueChange,
}: TabsBarProps) {
  const [editingTabId, setEditingTabId] = useState<WorkspaceTabId | null>(null)
  const [editingLabel, setEditingLabel] = useState("")

  function startRename(tab: WorkspaceTab) {
    setEditingTabId(tab.id)
    setEditingLabel(tab.label)
  }

  function commitRename() {
    if (!editingTabId) {
      return
    }

    onRenameChat?.(editingTabId, editingLabel)
    setEditingTabId(null)
    setEditingLabel("")
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <Tabs value={value} onValueChange={onValueChange} className="min-w-0 flex-1">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
          {tabs.map((tab) => (
            editingTabId === tab.id ? (
              <input
                key={tab.id}
                aria-label={`Rename ${tab.label}`}
                autoFocus
                value={editingLabel}
                onBlur={commitRename}
                onChange={(event) => setEditingLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitRename()
                  }

                  if (event.key === "Escape") {
                    setEditingTabId(null)
                    setEditingLabel("")
                  }
                }}
                className="h-9 min-w-28 rounded-xl border border-blue-400/30 bg-slate-950/60 px-3 text-xs font-bold text-white outline-none ring-2 ring-blue-400/20"
              />
            ) : (
              <div
                key={tab.id}
                className="group/chat-tab flex shrink-0 items-center rounded-xl border border-transparent bg-transparent transition data-[active=true]:border-blue-400/30 data-[active=true]:bg-gradient-to-b data-[active=true]:from-blue-500/25 data-[active=true]:to-white/[0.04]"
                data-active={tab.id === value}
              >
                <TabsTrigger
                  value={tab.id}
                  onDoubleClick={() => startRename(tab)}
                  className="rounded-xl border-0 bg-transparent px-4 py-2.5 pr-2 text-xs font-bold transition data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-300"
                >
                  {tab.label}
                </TabsTrigger>
                {onDeleteChat ? (
                  <button
                    type="button"
                    aria-label={`Delete chat ${tab.label}`}
                    title="Delete chat"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteChat(tab.id)
                    }}
                    className="mr-1 flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 opacity-70 transition hover:bg-rose-500/20 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 group-hover/chat-tab:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            )
          ))}
        </TabsList>
      </Tabs>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="Create new chat"
          title="Create new chat"
          onClick={onCreateChat}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-300/25 bg-white/5 text-sky-100 transition hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Clear chat"
          onClick={onClearChat}
          className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
        >
          Clear chat
        </button>
      </div>
    </div>
  )
}