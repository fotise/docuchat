import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { dashboardConfig } from "@/config/dashboard"
import { useWorkspaceStore } from "@/store/workspace-store"

export function NotFoundPage() {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const defaultPath = workspaces[0]?.path ?? dashboardConfig.workspaces[0]?.path ?? "/"
  const { labels } = dashboardConfig

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
        <h1 className="text-2xl font-bold">{labels.pageNotFoundTitle}</h1>
        <p className="mt-3 text-sm text-slate-400">
          {labels.pageNotFoundDescription}
        </p>

        <Button asChild className="mt-6 rounded-xl">
          <Link to={defaultPath}>{labels.backHome}</Link>
        </Button>
      </div>
    </div>
  )
}