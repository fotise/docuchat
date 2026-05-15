import { useState, type ReactNode } from "react"
import { ChevronDown, Heart } from "lucide-react"
import { dashboardConfig } from "@/config/dashboard"
import { useWorkspaceStore } from "@/store/workspace-store"
import type { WorkspaceRouteConfig } from "@/types/dashboard"
import { AppIcon } from "./icon"
import { IconPeaker } from "./icon-peaker"
import { MobileMenu } from "./mobile-menu"

interface HeaderProps {
  workspace: WorkspaceRouteConfig
}

interface HeaderChipProps {
  icon: ReactNode
  label: ReactNode
}

function HeaderChip({ icon, label }: HeaderChipProps) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,.45)]">
      {icon}
      <span>{label}</span>
    </div>
  )
}

export function Header({ workspace }: HeaderProps) {
  const [statusMessage, setStatusMessage] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace)
  const updateWorkspaceIcon = useWorkspaceStore((state) => state.updateWorkspaceIcon)
  const { header } = dashboardConfig

  function handleExploreClick() {
    setStatusMessage("Workspace explorer controls are not connected yet.")
  }

  async function commitRename() {
    const trimmedTitle = draftTitle.trim()

    if (!trimmedTitle) {
      setIsRenaming(false)
      return
    }

    await renameWorkspace(workspace.id, trimmedTitle)
    setIsRenaming(false)
    setStatusMessage(`Workspace renamed to ${trimmedTitle}.`)
  }

  function cancelRename() {
    setIsRenaming(false)
  }

  function startRename() {
    setDraftTitle(workspace.title)
    setIsRenaming(true)
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-white/10 bg-[linear-gradient(180deg,rgba(17,28,81,.95),rgba(10,18,52,.92))] px-4 md:px-5">
      <div className="flex min-w-0 items-center gap-3 py-3">
        <div className="md:hidden">
          <MobileMenu />
        </div>

        <IconPeaker
          value={workspace.navIcon}
          workspaceTitle={workspace.title}
          onChange={(icon) => void updateWorkspaceIcon(workspace.id, icon)}
        />

        <div className="min-w-0">
          {isRenaming ? (
            <input
              aria-label="Workspace name"
              autoFocus
              value={draftTitle}
              onBlur={() => void commitRename()}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void commitRename()
                }

                if (event.key === "Escape") {
                  cancelRename()
                }
              }}
              className="h-8 max-w-full rounded-lg border border-sky-400/30 bg-white/10 px-2 text-lg font-extrabold text-white outline-none ring-2 ring-sky-400/20 md:text-xl"
            />
          ) : (
            <button
              type="button"
              aria-label={`Rename workspace ${workspace.title}`}
              title="Double-click to rename workspace"
              onDoubleClick={startRename}
              className="max-w-full truncate text-left text-lg font-extrabold text-white outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-sky-400 md:text-xl"
            >
              {workspace.title}
              {workspace.isFavorite ? (
                <Heart className="ml-1 inline h-3.5 w-3.5 fill-sky-400 text-sky-400" />
              ) : null}
            </button>
          )}

          <div className="truncate text-sm text-slate-400">
            {workspace.documentCount} {workspace.documentLabel}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 py-3">
        <HeaderChip
          icon={<AppIcon name="search" className="h-4 w-4" />}
          label={header.speedLabel}
        />

        <HeaderChip
          icon={<AppIcon name="shield" className="h-4 w-4" />}
          label={
            <span className="flex items-center gap-1">
              {header.engineLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          }
        />

        <button
          type="button"
          aria-label="Open workspace explorer"
          title="Open workspace explorer"
          onClick={handleExploreClick}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,.45)]"
        >
          <AppIcon name="compass" className="h-4 w-4" />
        </button>

        <span className="sr-only" role="status">
          {statusMessage}
        </span>
      </div>
    </div>
  )
}