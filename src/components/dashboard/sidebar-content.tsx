import { useState } from "react"
import { Button } from "@/components/ui/button"
import { dashboardConfig } from "@/config/dashboard"
import { AppIcon } from "./icon"
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
  const { brand, sidebar, workspaces } = dashboardConfig

  function handleCreateWorkspace() {
    setStatusMessage("Workspace creation is not connected yet.")
  }

  function handleRecentChatClick(item: string) {
    setStatusMessage(`${item} is a recent chat shortcut placeholder.`)
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
          onClick={handleCreateWorkspace}
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
        {workspaces.map((workspace) => (
          <NavItem
            key={workspace.id}
            to={workspace.path}
            icon={workspace.navIcon}
            label={workspace.navLabel}
            onClick={onNavigate}
          />
        ))}

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