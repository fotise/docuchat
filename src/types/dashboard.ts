export type IconKey =
  | "fileText"
  | "folderKanban"
  | "scale"
  | "briefcase"
  | "mail"
  | "search"
  | "shield"
  | "compass"

export type UploadedDocTone = "blue" | "red" | "green" | "gray"
export type FileProcessingStatus = "toBeProcessed" | "processing" | "processed" | "error"
export type MessageSide = "left" | "right"
export type WorkspaceTabId = string
export type ChartMetricKey = "growth" | "reach" | "intent" | "signal"

export interface BrandConfig {
  name: string
  accent: string
  icon: IconKey
}

export interface HeaderConfig {
  speedLabel: string
  engineLabel: string
}

export interface LabelsConfig {
  uploadButton: string
  manageButton: string
  activeChatsTitle: string
  uploadedDocumentsTitle: string
  inputPlaceholder: string
  sendButton: string
  assistantTyping: string
  pageNotFoundTitle: string
  pageNotFoundDescription: string
}

export interface SidebarConfig {
  ctaLabel: string
  recentTitle: string
  recentItems: string[]
}

export interface WorkspaceTab {
  id: WorkspaceTabId
  label: string
  colorClass: string
}

export interface WorkspaceMessage {
  id: string
  side: MessageSide
  text: string
}

export interface HighlightedFile {
  name: string
  tone: UploadedDocTone
}

export interface ChartPoint {
  name: string
  growth: number
  reach: number
  intent: number
  signal: number
}

export interface ChartSeries {
  key: ChartMetricKey
  gradientId: string
  stroke: string
}

export interface WorkspaceView {
  tabId: WorkspaceTabId
  highlightedFile: HighlightedFile
  initialMessages: WorkspaceMessage[]
  chartData: ChartPoint[]
}

export interface UploadedDocument {
  id: string
  name: string
  type: string
  tone: UploadedDocTone
  size?: number
  uploadedAt?: number
  chunkCount?: number
  parentChunkCount?: number
  childChunkCount?: number
  graphEdgeCount?: number
  graphEntityCount?: number
  pageCount?: number
  toBeProcessed?: boolean
  processingStatus?: FileProcessingStatus
}

export interface WorkspaceRouteConfig {
  id: string
  path: string
  navLabel: string
  navIcon: IconKey
  title: string
  documentCount: number
  documentLabel: string
  isFavorite: boolean
  semanticSearchThreshold?: number
  ragSearchChildMatchLimit?: number
  ragSearchParentChunkLimit?: number
  graphSearchDepth?: number
  tabs: WorkspaceTab[]
  views: WorkspaceView[]
  uploadedDocuments: UploadedDocument[]
}

export interface DashboardConfig {
  brand: BrandConfig
  header: HeaderConfig
  labels: LabelsConfig
  sidebar: SidebarConfig
  chartSeries: ChartSeries[]
  workspaces: WorkspaceRouteConfig[]
}