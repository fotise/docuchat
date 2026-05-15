import { useState, type ReactNode } from "react"
import { ChevronDown, Heart } from "lucide-react"
import { dashboardConfig } from "@/config/dashboard"
import type { WorkspaceRouteConfig } from "@/types/dashboard"
import { AppIcon } from "./icon"
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
  const { header } = dashboardConfig

  function handleExploreClick() {
    setStatusMessage("Workspace explorer controls are not connected yet.")
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-white/10 bg-[linear-gradient(180deg,rgba(17,28,81,.95),rgba(10,18,52,.92))] px-4 md:px-5">
      <div className="flex min-w-0 items-center gap-3 py-3">
        <div className="md:hidden">
          <MobileMenu />
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-400/20 bg-gradient-to-br from-sky-400/20 to-sky-400/5 text-sky-300">
          <AppIcon name={workspace.navIcon} className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold text-white md:text-xl">
            {workspace.title}
            {workspace.isFavorite ? (
              <Heart className="ml-1 inline h-3.5 w-3.5 fill-sky-400 text-sky-400" />
            ) : null}
          </div>

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