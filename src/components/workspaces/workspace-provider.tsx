import { useEffect, type ReactNode } from "react"
import { dashboardConfig } from "@/config/dashboard"
import { useWorkspaceStore } from "@/store/workspace-store"

interface WorkspaceProviderProps {
  children: ReactNode
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const isLoaded = useWorkspaceStore((state) => state.isLoaded)
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces)

  useEffect(() => {
    if (!isLoaded) {
      void loadWorkspaces(dashboardConfig.workspaces)
    }
  }, [isLoaded, loadWorkspaces])

  return children
}
