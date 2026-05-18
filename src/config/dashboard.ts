import type { DashboardConfig } from "@/types/dashboard"

export const dashboardConfig = {
  brand: {
    name: "Docu",
    accent: "Chat",
    icon: "fileText",
  },

  header: {
    speedLabel: "Search Test",
    engineLabel: "X1",
  },

  labels: {
    uploadButton: "Upload Files",
    manageButton: "Manage Workspace",
    activeChatsTitle: "Active Chats",
    uploadedDocumentsTitle: "Uploaded Documents",
    inputPlaceholder: "Ask something about your documents...",
    sendButton: "Send",
    pageNotFoundTitle: "Workspace not found",
    pageNotFoundDescription: "The requested page does not exist or the route is invalid.",
  },

  sidebar: {
    ctaLabel: "New Workspace",
    recentTitle: "Recent Chats",
    recentItems: [],
  },

  chartSeries: [
    { key: "growth", gradientId: "series-growth", stroke: "#5dffb2" },
    { key: "reach", gradientId: "series-reach", stroke: "#49d1ff" },
    { key: "intent", gradientId: "series-intent", stroke: "#ff58cf" },
    { key: "signal", gradientId: "series-signal", stroke: "#a855f7" },
  ],

  workspaces: [] as DashboardConfig["workspaces"],
} satisfies DashboardConfig
