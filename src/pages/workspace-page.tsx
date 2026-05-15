import { useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { dashboardConfig } from "@/config/dashboard"
import { ActiveChatsCard } from "@/components/dashboard/active-chats-card"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { UploadedDocumentsCard } from "@/components/dashboard/uploaded-documents-card"
import { WorkspacePanel } from "@/components/dashboard/workspace-panel"
import { useDashboardStore } from "@/store/dashboard-store"
import { useWorkspaceStore } from "@/store/workspace-store"
import { NotFoundPage } from "./not-found-page"

export function WorkspacePage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace)
  const workspace = workspaces.find((item) => item.id === workspaceId)

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

  async function handleDeleteWorkspace() {
    if (!workspace) {
      return
    }

    await deleteWorkspace(workspace.id)

    const fallbackWorkspace = workspaces.find((item) => item.id !== workspace.id)
    navigate(fallbackWorkspace?.path ?? "/", { replace: true })
  }

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
            onDeleteWorkspace={() => void handleDeleteWorkspace()}
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