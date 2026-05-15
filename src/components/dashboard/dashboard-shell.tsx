import type { ReactNode } from "react"
import type { WorkspaceRouteConfig } from "@/types/dashboard"
import { Header } from "./header"
import { SidebarContent } from "./sidebar-content"

interface DashboardShellProps {
  workspace: WorkspaceRouteConfig
  children: ReactNode
  rightPanel?: ReactNode
}

export function DashboardShell({
  workspace,
  children,
  rightPanel,
}: DashboardShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_85%,rgba(173,63,255,.20),transparent_24%),radial-gradient(circle_at_65%_78%,rgba(27,124,255,.18),transparent_24%),radial-gradient(circle_at_45%_55%,rgba(24,68,180,.18),transparent_30%),linear-gradient(180deg,#05081a_0%,#071029_35%,#05081a_100%)] text-white">
      <div className="pointer-events-none absolute bottom-20 left-[-5%] h-1 w-[72%] rotate-[-11deg] rounded-full bg-[linear-gradient(90deg,transparent,#ff66d6_30%,#ff84eb_50%,transparent)] shadow-[0_0_18px_#ff4ed0,0_0_36px_rgba(255,78,208,.5)] opacity-70" />
      <div className="pointer-events-none absolute bottom-24 left-[42%] h-1 w-[68%] rotate-[10deg] rounded-full bg-[linear-gradient(90deg,transparent,#2f7bff_30%,#35b4ff_50%,transparent)] shadow-[0_0_18px_#2f7bff,0_0_36px_rgba(47,123,255,.5)] opacity-70" />

      <div className="relative grid min-h-screen grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="hidden border-r border-white/10 bg-[linear-gradient(180deg,rgba(21,32,87,.95),rgba(7,12,39,.96))] md:block">
          <SidebarContent showBrand />
        </aside>

        <div className="grid min-w-0 grid-rows-[74px_1fr] xl:col-span-2 xl:grid-cols-[minmax(0,1fr)_300px] xl:grid-rows-[74px_1fr]">
          <div className="xl:col-span-2">
            <Header workspace={workspace} />
          </div>

          <main className="min-w-0 p-2.5">
            {children}
          </main>

          <aside className="min-w-0 space-y-3 p-2.5 pt-0 xl:pt-2.5">
            {rightPanel}
          </aside>
        </div>
      </div>
    </div>
  )
}