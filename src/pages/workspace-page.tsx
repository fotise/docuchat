import { useEffect } from "react"
import { useParams } from "react-router-dom"
import { dashboardConfig } from "@/config/dashboard"
import { ActiveChatsCard } from "@/components/dashboard/active-chats-card"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { UploadedDocumentsCard } from "@/components/dashboard/uploaded-documents-card"
import { WorkspacePanel } from "@/components/dashboard/workspace-panel"
import { useDashboardStore } from "@/store/dashboard-store"
import { NotFoundPage } from "./not-found-page"

export function WorkspacePage() {
  const { workspaceId } = useParams()
  const workspace = dashboardConfig.workspaces.find((item) => item.id === workspaceId)

  const ensureWorkspaceInitialized = useDashboardStore(
    (state) => state.ensureWorkspaceInitialized
  )
  const setActiveTab = useDashboardStore((state) => state.setActiveTab)

  const activeTab = useDashboardStore((state) => {
    if (!workspace) {
      return ""
    }

    return state.activeTabByWorkspace[workspace.id] ?? workspace.tabs[0]?.id ?? ""
  })

  useEffect(() => {
    if (!workspace) {
      return
    }

    ensureWorkspaceInitialized(workspace)
  }, [workspace, ensureWorkspaceInitialized])

  useEffect(() => {
    if (!workspace) {
      return
    }

    const isValid = workspace.tabs.some((tab) => tab.id === activeTab)

    if (!isValid && workspace.tabs[0]) {
      setActiveTab(workspace.id, workspace.tabs[0].id)
    }
  }, [workspace, activeTab, setActiveTab])

  if (!workspace) {
    return <NotFoundPage />
  }

  const { labels } = dashboardConfig

  return (
    <DashboardShell
      workspace={workspace}
      rightPanel={
        <>
          <UploadedDocumentsCard
            title={labels.uploadedDocumentsTitle}
            uploadLabel={labels.uploadButton}
            manageLabel={labels.manageButton}
            documents={workspace.uploadedDocuments}
          />

          <ActiveChatsCard
            title={labels.activeChatsTitle}
            tabs={workspace.tabs}
            activeTab={activeTab}
          />
        </>
      }
    >
      <WorkspacePanel workspace={workspace} />
    </DashboardShell>
  )
}