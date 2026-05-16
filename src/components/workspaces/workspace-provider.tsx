import { useEffect, type ReactNode } from "react"
import { dashboardConfig } from "@/config/dashboard"
import { useWorkspaceStore } from "@/store/workspace-store"

interface WorkspaceProviderProps {
  children: ReactNode
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const isLoaded = useWorkspaceStore((state) => state.isLoaded)
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces)
  const processNextWorkspaceDocument = useWorkspaceStore(
    (state) => state.processNextWorkspaceDocument
  )

  useEffect(() => {
    if (!isLoaded) {
      void loadWorkspaces(dashboardConfig.workspaces)
    }
  }, [isLoaded, loadWorkspaces])

  useEffect(() => {
    if (!isLoaded) {
      return
    }

    if (typeof Worker !== "undefined") {
      void processNextWorkspaceDocument()
    }

    const intervalId = window.setInterval(() => {
      void processNextWorkspaceDocument()
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isLoaded, processNextWorkspaceDocument])

  return children
}
