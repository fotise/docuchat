import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { dashboardConfig } from "@/config/dashboard"
import { NotFoundPage } from "@/pages/not-found-page"
import { WorkspacePage } from "@/pages/workspace-page"
import { useWorkspaceStore } from "@/store/workspace-store"

export default function App() {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const defaultPath = workspaces[0]?.path ?? dashboardConfig.workspaces[0]?.path

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={defaultPath ? <Navigate to={defaultPath} replace /> : <NotFoundPage />}
        />
        <Route path="/workspaces/:workspaceId" element={<WorkspacePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}