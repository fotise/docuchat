import React from "react"
import ReactDOM from "react-dom/client"
import { LlmProvider } from "@/components/llm/llm-provider"
import App from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LlmProvider>
      <App />
    </LlmProvider>
  </React.StrictMode>
)