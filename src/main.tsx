import React from "react"
import ReactDOM from "react-dom/client"
import { LlmProvider } from "@/components/llm/llm-provider"
import { WorkspaceProvider } from "@/components/workspaces/workspace-provider"
import App from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LlmProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </LlmProvider>
  </React.StrictMode>
)