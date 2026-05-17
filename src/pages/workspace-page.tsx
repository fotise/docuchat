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
  const deleteAllWorkspaceDocuments = useWorkspaceStore((state) => state.deleteAllWorkspaceDocuments)
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace)
  const deleteWorkspaceDocument = useWorkspaceStore((state) => state.deleteWorkspaceDocument)
  const reprocessWorkspaceDocument = useWorkspaceStore((state) => state.reprocessWorkspaceDocument)
  const uploadWorkspaceFiles = useWorkspaceStore((state) => state.uploadWorkspaceFiles)
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

  async function handleUploadFiles(files: File[]) {
    if (!workspace) {
      return
    }

    await uploadWorkspaceFiles(workspace.id, files)
  }

  async function handleDeleteDocument(documentId: string) {
    if (!workspace) {
      return
    }

    await deleteWorkspaceDocument(workspace.id, documentId)
  }

  async function handleDeleteAllDocuments() {
    if (!workspace) {
      return
    }

    await deleteAllWorkspaceDocuments(workspace.id)
  }

  async function handleReprocessDocument(documentId: string) {
    if (!workspace) {
      return
    }

    await reprocessWorkspaceDocument(workspace.id, documentId)
  }

  return (
    <DashboardShell
      workspace={workspace}
      rightPanel={
        <>
          <UploadedDocumentsCard
            workspaceId={workspace.id}
            title={labels.uploadedDocumentsTitle}
            uploadLabel={labels.uploadButton}
            manageLabel={labels.manageButton}
            documents={workspace.uploadedDocuments}
            onUploadFiles={(files) => void handleUploadFiles(files)}
            onDeleteAllDocuments={() => void handleDeleteAllDocuments()}
            onDeleteDocument={(documentId) => void handleDeleteDocument(documentId)}
            onReprocessDocument={(documentId) => void handleReprocessDocument(documentId)}
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