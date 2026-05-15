import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { dashboardConfig } from "@/config/dashboard"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store/workspace-store"
import { AppIcon } from "./icon"
import { IconPeaker } from "./icon-peaker"
import { NavItem } from "./nav-item"

interface SidebarContentProps {
  showBrand?: boolean
  onNavigate?: () => void
}

export function SidebarContent({
  showBrand = true,
  onNavigate,
}: SidebarContentProps) {
  const [statusMessage, setStatusMessage] = useState("")
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const navigate = useNavigate()
  const location = useLocation()
  const { brand, sidebar } = dashboardConfig
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace)
  const updateWorkspaceIcon = useWorkspaceStore((state) => state.updateWorkspaceIcon)

  async function handleCreateWorkspace() {
    const workspace = await createWorkspace()

    setStatusMessage(`${workspace.title} created.`)
    onNavigate?.()
    navigate(workspace.path)
  }

  function handleRecentChatClick(item: string) {
    setStatusMessage(`${item} is a recent chat shortcut placeholder.`)
  }

  function startRename(workspaceId: string, title: string) {
    setRenamingWorkspaceId(workspaceId)
    setDraftName(title)
  }

  async function commitRename(workspaceId: string) {
    const trimmedName = draftName.trim()

    if (!trimmedName) {
      setRenamingWorkspaceId(null)
      return
    }

    await renameWorkspace(workspaceId, trimmedName)
    setRenamingWorkspaceId(null)
    setStatusMessage(`${trimmedName} renamed.`)
  }

  function cancelRename() {
    setRenamingWorkspaceId(null)
  }

  return (
    <div className="flex h-full flex-col">
      {showBrand ? (
        <div className="flex h-[74px] items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 shadow-[0_6px_18px_rgba(42,119,255,0.35)]">
            <AppIcon name={brand.icon} className="h-4 w-4 text-white" />
          </div>

          <div className="text-xl font-bold tracking-wide text-white">
            {brand.name}
            <span className="text-sky-400">{brand.accent}</span>
          </div>
        </div>
      ) : null}

      <div className="p-4">
        <Button
          aria-label={sidebar.ctaLabel}
          onClick={() => void handleCreateWorkspace()}
          className="w-full rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-[0_10px_24px_rgba(34,107,255,0.35)] hover:from-blue-500 hover:to-blue-600"
        >
          <span className="mr-2 text-base">+</span>
          {sidebar.ctaLabel}
        </Button>

        <p className="mt-2 min-h-4 text-xs text-sky-200/75" role="status">
          {statusMessage}
        </p>
      </div>

      <div className="px-2 pb-4">
        {workspaces.map((workspace) => {
          const isActive = location.pathname === workspace.path

          return (
            <div
              key={workspace.id}
              className={cn(
                "mb-1 flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-semibold transition-colors",
                isActive
                  ? "border-blue-400/30 bg-gradient-to-b from-blue-500/25 to-indigo-950/70 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_rgba(0,0,0,0.25)]"
                  : "border-transparent bg-white/[0.02] text-slate-100 hover:bg-white/[0.05]"
              )}
            >
              <IconPeaker
                value={workspace.navIcon}
                workspaceTitle={workspace.title}
                ariaLabel={`Change sidebar icon for ${workspace.title}`}
                variant="sidebar"
                onChange={(icon) => void updateWorkspaceIcon(workspace.id, icon)}
              />

              {renamingWorkspaceId === workspace.id ? (
                <input
                  aria-label={`Rename sidebar workspace ${workspace.title}`}
                  autoFocus
                  value={draftName}
                  onBlur={() => void commitRename(workspace.id)}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void commitRename(workspace.id)
                    }

                    if (event.key === "Escape") {
                      event.preventDefault()
                      cancelRename()
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-sky-400/30 bg-white/10 px-2 py-1 text-sm font-semibold text-white outline-none ring-2 ring-sky-400/20"
                />
              ) : (
                <Link
                  to={workspace.path}
                  onClick={onNavigate}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    startRename(workspace.id, workspace.title)
                  }}
                  className="min-w-0 flex-1 truncate outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  {workspace.navLabel}
                </Link>
              )}
            </div>
          )
        })}

        <div className="px-3 pb-2 pt-5 text-xs text-indigo-200/70">
          {sidebar.recentTitle}
        </div>

        {sidebar.recentItems.map((item, index) => (
          <NavItem
            key={`${item}-${index}`}
            icon="mail"
            label={item}
            small
            onClick={() => handleRecentChatClick(item)}
          />
        ))}
      </div>
    </div>
  )
}