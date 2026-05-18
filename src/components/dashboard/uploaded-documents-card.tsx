import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Upload,
} from "lucide-react"
import ForceGraph2D, { type NodeObject } from "react-force-graph-2d"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getDocumentChunks,
  getWorkspaceDocument,
  getWorkspaceGraphEdges,
  getWorkspaceGraphEntities,
  type StoredDocumentChunk,
  type StoredWorkspaceDocument,
  type StoredGraphEdge,
  type StoredGraphEntity,
} from "@/lib/chat-history/indexed-db"
import type { UploadedDocument } from "@/types/dashboard"
import { DocumentMiniCard } from "./document-mini-card"
import { FilePreviewIcon } from "./file-preview-icon"
import { OntologyEditorTab } from "./ontology-editor-tab"

const CHUNKS_PER_PAGE = 10
const MAX_WORKSPACE_GRAPH_NODES = 80
const MAX_WORKSPACE_GRAPH_LINKS = 140

interface UploadedDocumentsCardProps {
  workspaceId: string
  title: string
  uploadLabel: string
  manageLabel: string
  documents: UploadedDocument[]
  deleteLabel?: string
  onUploadFiles?: (files: File[]) => Promise<void> | void
  onDeleteDocument?: (documentId: string) => Promise<void> | void
  onDeleteAllDocuments?: () => Promise<void> | void
  onReprocessDocument?: (documentId: string) => Promise<void> | void
  onDeleteWorkspace?: () => void
}

interface WorkspaceGraphNode {
  documentName?: string
  id: string
  name: string
  selected: boolean
  type: string
}

interface WorkspaceGraphLink {
  confidence: number
  selected: boolean
  source: string
  target: string
  type: string
  weight: number
}

export function UploadedDocumentsCard({
  workspaceId,
  title,
  uploadLabel,
  manageLabel,
  documents,
  deleteLabel = "Delete Workspace",
  onUploadFiles,
  onDeleteDocument,
  onDeleteAllDocuments,
  onReprocessDocument,
  onDeleteWorkspace,
}: UploadedDocumentsCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [activeChunkTab, setActiveChunkTab] = useState("parents")
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isManagingWorkspace, setIsManagingWorkspace] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [childChunkPage, setChildChunkPage] = useState(1)
  const [documentChunks, setDocumentChunks] = useState<StoredDocumentChunk[]>([])
  const [workspaceGraphEdges, setWorkspaceGraphEdges] = useState<StoredGraphEdge[]>([])
  const [workspaceGraphEntities, setWorkspaceGraphEntities] = useState<StoredGraphEntity[]>([])
  const [isLoadingWorkspaceGraph, setIsLoadingWorkspaceGraph] = useState(false)
  const [isLoadingChunks, setIsLoadingChunks] = useState(false)
  const [managementSearchQuery, setManagementSearchQuery] = useState("")
  const [managementTab, setManagementTab] = useState("files")
  const [managementTypeFilter, setManagementTypeFilter] = useState("all")
  const [parentChunkPage, setParentChunkPage] = useState(1)
  const [previewDocumentChunks, setPreviewDocumentChunks] = useState<StoredDocumentChunk[]>([])
  const [previewDocument, setPreviewDocument] = useState<StoredWorkspaceDocument | null>(null)
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState("")
  const [previewTab, setPreviewTab] = useState("original")
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState("")
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const selectedDocument = documents.find(
    (document) => document.id === selectedDocumentId
  ) ?? null
  const parentChunks = useMemo(
    () => documentChunks.filter((chunk) => chunk.level === "parent"),
    [documentChunks]
  )
  const childChunks = useMemo(
    () => documentChunks.filter((chunk) => chunk.level === "child"),
    [documentChunks]
  )
  const childCountByParentId = useMemo(() => {
    const counts = new Map<string, number>()

    for (const chunk of childChunks) {
      if (chunk.parentChunkId) {
        counts.set(chunk.parentChunkId, (counts.get(chunk.parentChunkId) ?? 0) + 1)
      }
    }

    return counts
  }, [childChunks])
  const parentChunkPageCount = Math.max(
    1,
    Math.ceil(parentChunks.length / CHUNKS_PER_PAGE)
  )
  const childChunkPageCount = Math.max(
    1,
    Math.ceil(childChunks.length / CHUNKS_PER_PAGE)
  )
  const paginatedParentChunks = useMemo(
    () => parentChunks.slice(
      (parentChunkPage - 1) * CHUNKS_PER_PAGE,
      parentChunkPage * CHUNKS_PER_PAGE
    ),
    [parentChunkPage, parentChunks]
  )
  const paginatedChildChunks = useMemo(
    () => childChunks.slice(
      (childChunkPage - 1) * CHUNKS_PER_PAGE,
      childChunkPage * CHUNKS_PER_PAGE
    ),
    [childChunkPage, childChunks]
  )
  const fileTypeOptions = useMemo(
    () => Array.from(
      new Set(documents.map((document) => document.type.toLowerCase()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b)),
    [documents]
  )
  const filteredManagementDocuments = useMemo(() => {
    const normalizedQuery = managementSearchQuery.trim().toLowerCase()

    return documents.filter((document) => {
      const matchesSearch = normalizedQuery.length === 0 ||
        document.name.toLowerCase().includes(normalizedQuery)
      const matchesType = managementTypeFilter === "all" ||
        document.type.toLowerCase() === managementTypeFilter

      return matchesSearch && matchesType
    })
  }, [documents, managementSearchQuery, managementTypeFilter])
  const workspaceTotalSize = useMemo(
    () => documents.reduce((total, document) => total + (document.size ?? 0), 0),
    [documents]
  )
  const workspaceTotalChunks = useMemo(
    () => documents.reduce((total, document) => total + (document.chunkCount ?? 0), 0),
    [documents]
  )
  const workspacePendingFiles = useMemo(
    () => documents.filter(
      (document) => document.toBeProcessed || document.processingStatus === "toBeProcessed"
    ).length,
    [documents]
  )
  const documentNameById = useMemo(
    () => new Map(documents.map((document) => [document.id, document.name])),
    [documents]
  )
  const workspaceGraph = useMemo(() => {
    const visibleEntities = workspaceGraphEntities.slice(0, MAX_WORKSPACE_GRAPH_NODES)
    const visibleEntityIds = new Set(visibleEntities.map((entity) => entity.id))
    const nodes = visibleEntities.map((entity) => ({
      documentName: entity.documentId ? documentNameById.get(entity.documentId) : undefined,
      id: entity.id,
      name: entity.name,
      selected: selectedGraphNodeId === entity.id,
      type: entity.type,
    }))
    const links = workspaceGraphEdges
      .filter((edge) => visibleEntityIds.has(edge.sourceEntityId) && visibleEntityIds.has(edge.targetEntityId))
      .slice(0, MAX_WORKSPACE_GRAPH_LINKS)
      .map((edge) => ({
        confidence: edge.confidence,
        selected: selectedGraphNodeId === edge.sourceEntityId || selectedGraphNodeId === edge.targetEntityId,
        source: edge.sourceEntityId,
        target: edge.targetEntityId,
        type: edge.type,
        weight: edge.weight,
      }))

    return { links, nodes }
  }, [documentNameById, selectedGraphNodeId, workspaceGraphEdges, workspaceGraphEntities])
  const selectedGraphEntity = useMemo(
    () => workspaceGraphEntities.find((entity) => entity.id === selectedGraphNodeId),
    [selectedGraphNodeId, workspaceGraphEntities]
  )
  const previewMimeType = previewDocument?.mimeType ?? ""
  const previewOriginalText = useMemo(() => {
    if (!previewDocument?.content || !previewMimeType.startsWith("text/")) {
      return ""
    }

    return new TextDecoder().decode(previewDocument.content)
  }, [previewDocument, previewMimeType])
  const rawExtractedText = useMemo(() => {
    const extractedParentChunks = previewDocumentChunks.filter((chunk) => chunk.level === "parent")

    return extractedParentChunks
      .map((chunk, index) => [
        `--- Extracted page ${index + 1} · source pages ${formatPageNumbers(chunk.pageNumbers)} · ${chunk.chunkId} ---`,
        chunk.text,
      ].join("\n"))
      .join("\n\n")
  }, [previewDocumentChunks])

  useEffect(() => {
    if (!selectedDocument) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedDocumentId(null)
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectedDocument])

  useEffect(() => {
    let isCurrent = true

    if (!selectedDocument) {
      return
    }

    void getDocumentChunks(selectedDocument.id)
      .then((chunks) => {
        if (isCurrent) {
          setDocumentChunks(chunks)
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingChunks(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [selectedDocument])

  useEffect(() => {
    return () => {
      if (previewDocumentUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(previewDocumentUrl)
      }
    }
  }, [previewDocumentUrl])

  useEffect(() => {
    let isCurrent = true

    if (!previewDocument) {
      return
    }

    void getDocumentChunks(previewDocument.id)
      .then((chunks) => {
        if (isCurrent) {
          setPreviewDocumentChunks(chunks)
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingPreview(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [previewDocument])

  useEffect(() => {
    let isCurrent = true

    if (!isManagingWorkspace) {
      return
    }

    Promise.all([
      getWorkspaceGraphEntities(workspaceId),
      getWorkspaceGraphEdges(workspaceId),
    ])
      .then(([entities, edges]) => {
        if (isCurrent) {
          setWorkspaceGraphEntities(entities)
          setWorkspaceGraphEdges(edges)
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingWorkspaceGraph(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [isManagingWorkspace, workspaceId])

  function handleOpenDocument(documentId: string) {
    setActiveChunkTab("parents")
    setIsManagingWorkspace(false)
    setSelectedDocumentId(documentId)
    setChildChunkPage(1)
    setDocumentChunks([])
    setIsLoadingChunks(true)
    setParentChunkPage(1)
  }

  async function handleOpenPreview(documentId: string) {
    setPreviewTab("original")
    setPreviewDocument(null)
    setPreviewDocumentChunks([])
    setIsLoadingPreview(true)

    const storedDocument = await getWorkspaceDocument(documentId)

    if (!storedDocument) {
      setStatusMessage("File preview is not available for this document.")
      setIsLoadingPreview(false)
      return
    }

    setPreviewDocument(storedDocument)
    const previewBlob = storedDocument.blob instanceof Blob
      ? storedDocument.blob
      : new Blob([storedDocument.content], { type: storedDocument.mimeType })

    setPreviewDocumentUrl(
      typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(previewBlob)
        : ""
    )
  }

  function handleClosePreview() {
    setPreviewDocument(null)
    setPreviewDocumentChunks([])
    setPreviewDocumentUrl("")
    setPreviewTab("original")
    setIsLoadingPreview(false)
  }

  function handleUploadClick() {
    setIsConfirmingDelete(false)

    if (onUploadFiles) {
      fileInputRef.current?.click()
      return
    }

    setStatusMessage("File upload is not connected yet.")
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])

    if (files.length === 0 || !onUploadFiles) {
      return
    }

    setIsUploading(true)

    try {
      await onUploadFiles(files)
      setStatusMessage(
        files.length === 1
          ? `Uploaded ${files[0].name} to this workspace.`
          : `Uploaded ${files.length} files to this workspace.`
      )
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  function handleManageClick() {
    setIsConfirmingDelete(false)
    setManagementSearchQuery("")
    setManagementTab("files")
    setManagementTypeFilter("all")
    setIsLoadingWorkspaceGraph(true)
    setSelectedGraphNodeId("")
    setSelectedDocumentId(null)
    setIsManagingWorkspace(true)
  }

  async function refreshWorkspaceGraph() {
    setIsLoadingWorkspaceGraph(true)

    try {
      const [entities, edges] = await Promise.all([
        getWorkspaceGraphEntities(workspaceId),
        getWorkspaceGraphEdges(workspaceId),
      ])

      setWorkspaceGraphEntities(entities)
      setWorkspaceGraphEdges(edges)
    } finally {
      setIsLoadingWorkspaceGraph(false)
    }
  }

  function handleDeleteClick() {
    setIsConfirmingDelete(true)
    setStatusMessage("Deleting this workspace will remove its documents and chats.")
  }

  function handleCancelDelete() {
    setIsConfirmingDelete(false)
    setStatusMessage("Workspace deletion cancelled.")
  }

  function handleConfirmDelete() {
    setIsConfirmingDelete(false)
    setIsManagingWorkspace(false)
    onDeleteWorkspace?.()
  }

  async function handleDeleteAllDocuments() {
    if (!onDeleteAllDocuments) {
      return
    }

    await onDeleteAllDocuments()
    setStatusMessage("Deleted all files from this workspace.")
  }

  async function handleDeleteDocumentById(documentId: string) {
    if (!onDeleteDocument) {
      return
    }

    const documentToDelete = documents.find((document) => document.id === documentId)
    const deletedName = documentToDelete?.name ?? "File"

    await onDeleteDocument(documentId)

    if (selectedDocumentId === documentId) {
      setSelectedDocumentId(null)
    }

    if (previewDocument?.id === documentId) {
      handleClosePreview()
    }

    setStatusMessage(`Deleted ${deletedName} from this workspace.`)
  }

  async function handleDeleteDocument() {
    if (!selectedDocument || !onDeleteDocument) {
      return
    }

    await handleDeleteDocumentById(selectedDocument.id)
  }

  async function handleReprocessDocument() {
    if (!selectedDocument || !onReprocessDocument) {
      return
    }

    await onReprocessDocument(selectedDocument.id)
    setActiveChunkTab("parents")
    setChildChunkPage(1)
    setDocumentChunks([])
    setIsLoadingChunks(false)
    setParentChunkPage(1)
    setStatusMessage(`${selectedDocument.name} is queued for reprocessing.`)
  }

  function formatFileSize(size?: number) {
    if (typeof size !== "number") {
      return "Size unavailable"
    }

    if (size < 1024) {
      return `${size} B`
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  function formatCount(value?: number) {
    return typeof value === "number" ? value.toLocaleString() : "Unavailable"
  }

  function formatPageNumbers(pageNumbers: number[]) {
    return pageNumbers.length > 0 ? pageNumbers.join(", ") : "—"
  }

  function formatEmbeddingPreview(embedding?: number[]) {
    if (!embedding || embedding.length === 0) {
      return "—"
    }

    const preview = embedding.slice(0, 4).map((value) => value.toFixed(3)).join(", ")
    return embedding.length > 4 ? `[${preview}, …]` : `[${preview}]`
  }

  function formatTextPreview(text: string) {
    return text.length > 96 ? `${text.slice(0, 96)}…` : text
  }

  function getDisplayTone(document: UploadedDocument) {
    if (document.processingStatus === "error") {
      return "red"
    }

    return document.toBeProcessed || document.processingStatus === "processing" ? "gray" : "blue"
  }

  return (
    <Card className="rounded-[18px] border-white/10 bg-[linear-gradient(180deg,rgba(18,28,79,.92),rgba(12,20,58,.94))] text-white shadow-[0_10px_30px_rgba(0,0,0,.45)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-extrabold">
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div
          className="app-scrollbar grid max-h-[354px] grid-cols-2 gap-3 overflow-y-auto overflow-x-visible pr-1 sm:grid-cols-3 xl:grid-cols-2"
          role="list"
          aria-label="Workspace files"
        >
          {documents.map((doc) => (
            <DocumentMiniCard
              key={doc.id}
              childChunkCount={doc.childChunkCount}
              chunkCount={doc.chunkCount}
              name={doc.name}
              parentChunkCount={doc.parentChunkCount}
              tone={doc.tone}
              size={doc.size}
              toBeProcessed={doc.toBeProcessed}
              processingStatus={doc.processingStatus}
              onClick={() => handleOpenDocument(doc.id)}
              onDeleteClick={onDeleteDocument ? () => void handleDeleteDocumentById(doc.id) : undefined}
              onPreviewClick={() => void handleOpenPreview(doc.id)}
            />
          ))}
        </div>

        <Button
          aria-label={uploadLabel}
          onClick={handleUploadClick}
          disabled={isUploading}
          className="mt-4 w-full rounded-xl bg-gradient-to-b from-blue-400 to-blue-700 text-white hover:from-blue-400 hover:to-blue-600"
        >
          <Upload className="mr-2 h-4 w-4" />
          {isUploading ? "Uploading..." : uploadLabel}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          aria-label="Upload files to workspace"
          className="sr-only"
          onChange={(event) => void handleFileChange(event)}
        />

        <Button
          variant="secondary"
          aria-label={manageLabel}
          onClick={handleManageClick}
          className="mt-3 w-full rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
        >
          <Settings className="mr-2 h-4 w-4" />
          {manageLabel}
        </Button>

        {onDeleteWorkspace ? (
          <Button
            variant="destructive"
            aria-label={deleteLabel}
            onClick={handleDeleteClick}
            className="mt-3 w-full rounded-xl border border-rose-400/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {deleteLabel}
          </Button>
        ) : null}

        {isConfirmingDelete ? (
          <div
            className="mt-3 rounded-xl border border-rose-300/20 bg-rose-950/35 p-3 text-sm text-rose-50"
            role="alertdialog"
            aria-label="Confirm workspace deletion"
          >
            <p className="font-semibold">Delete this workspace?</p>
            <p className="mt-1 text-xs text-rose-100/80">
              This will remove its documents and chats from this device.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                aria-label="Cancel workspace deletion"
                onClick={handleCancelDelete}
                className="rounded-lg border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                aria-label="Confirm delete workspace"
                onClick={handleConfirmDelete}
                className="rounded-lg border border-rose-300/25 bg-rose-500/20 text-rose-50 hover:bg-rose-500/30"
              >
                Delete
              </Button>
            </div>
          </div>
        ) : null}

        <p className="mt-3 min-h-4 text-xs text-sky-200/75" role="status">
          {statusMessage}
        </p>
      </CardContent>

      {isManagingWorkspace ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace management"
        >
          <div className="flex h-[80vh] max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111b4b] text-white shadow-[0_24px_70px_rgba(0,0,0,.55)]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                Workspace management
              </p>
              <h2 className="mt-2 text-lg font-extrabold leading-tight">
                Files in this workspace
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {documents.length === 1
                  ? "1 file available"
                  : `${documents.length.toLocaleString()} files available`}
              </p>
            </div>

            <Tabs
              value={managementTab}
              onValueChange={setManagementTab}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="border-b border-white/10 px-5 py-3">
                <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0 text-slate-200">
                  <TabsTrigger
                    value="files"
                    className="rounded-xl px-4 py-2.5 text-xs font-bold transition data-[state=active]:border data-[state=active]:border-blue-400/30 data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500/25 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=inactive]:border data-[state=inactive]:border-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-300"
                  >
                    Files
                  </TabsTrigger>
                  <TabsTrigger
                    value="graph"
                    className="rounded-xl px-4 py-2.5 text-xs font-bold transition data-[state=active]:border data-[state=active]:border-violet-400/30 data-[state=active]:bg-gradient-to-b data-[state=active]:from-violet-500/25 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=inactive]:border data-[state=inactive]:border-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-300"
                  >
                    Interactive graph
                  </TabsTrigger>
                  <TabsTrigger
                    value="ontology"
                    onClick={() => setManagementTab("ontology")}
                    className="rounded-xl px-4 py-2.5 text-xs font-bold transition data-[state=active]:border data-[state=active]:border-emerald-400/30 data-[state=active]:bg-gradient-to-b data-[state=active]:from-emerald-500/25 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=inactive]:border data-[state=inactive]:border-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-300"
                  >
                    Ontology
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="files" className="m-0 min-h-0 flex-1">
                <div className="app-scrollbar h-full overflow-y-auto p-5">
                  <dl className="mb-4 grid grid-cols-4 gap-2 text-xs" aria-label="Workspace summary">
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <dt className="truncate text-[10px] uppercase tracking-[0.1em] text-sky-200/60">
                        Files
                      </dt>
                      <dd className="mt-1 truncate text-sm font-bold text-slate-50">
                        {formatCount(documents.length)}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <dt className="truncate text-[10px] uppercase tracking-[0.1em] text-sky-200/60">
                        Total size
                      </dt>
                      <dd className="mt-1 truncate text-sm font-bold text-slate-50">
                        {formatFileSize(workspaceTotalSize)}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <dt className="truncate text-[10px] uppercase tracking-[0.1em] text-sky-200/60">
                        Chunks
                      </dt>
                      <dd className="mt-1 truncate text-sm font-bold text-slate-50">
                        {formatCount(workspaceTotalChunks)}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <dt className="truncate text-[10px] uppercase tracking-[0.1em] text-sky-200/60">
                        Pending
                      </dt>
                      <dd className="mt-1 truncate text-sm font-bold text-slate-50">
                        {formatCount(workspacePendingFiles)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mb-4 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 md:grid-cols-[minmax(0,1fr)_220px]">
                    <label className="relative block">
                      <span className="sr-only">Search workspace files</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200/60" />
                      <Input
                        type="search"
                        aria-label="Search workspace files"
                        placeholder="Search files..."
                        value={managementSearchQuery}
                        onChange={(event) => setManagementSearchQuery(event.target.value)}
                        className="h-10 rounded-xl border-white/10 bg-slate-950/30 pl-9 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                      />
                    </label>
                    <label className="block">
                      <span className="sr-only">Filter files by type</span>
                      <select
                        aria-label="Filter files by type"
                        value={managementTypeFilter}
                        onChange={(event) => setManagementTypeFilter(event.target.value)}
                        className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 text-sm font-semibold text-slate-100 outline-none transition focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/20"
                      >
                        <option value="all">All file types</option>
                        {fileTypeOptions.map((type) => (
                          <option key={type} value={type}>
                            {type.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {documents.length > 0 && filteredManagementDocuments.length > 0 ? (
                    <div
                      className="app-scrollbar grid max-h-[372px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-6"
                      role="list"
                      aria-label="Workspace management files"
                    >
                      {filteredManagementDocuments.map((doc) => (
                        <DocumentMiniCard
                          key={doc.id}
                          childChunkCount={doc.childChunkCount}
                          chunkCount={doc.chunkCount}
                          name={doc.name}
                          parentChunkCount={doc.parentChunkCount}
                          tone={doc.tone}
                          size={doc.size}
                          toBeProcessed={doc.toBeProcessed}
                          processingStatus={doc.processingStatus}
                          onClick={() => handleOpenDocument(doc.id)}
                          onDeleteClick={onDeleteDocument ? () => void handleDeleteDocumentById(doc.id) : undefined}
                          onPreviewClick={() => void handleOpenPreview(doc.id)}
                        />
                      ))}
                    </div>
                  ) : documents.length > 0 ? (
                    <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5 text-sm text-slate-300">
                      No files match the current filters.
                    </div>
                  ) : (
                    <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5 text-sm text-slate-300">
                      No files in this workspace.
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="graph" className="m-0 min-h-0 flex-1">
                <div className="app-scrollbar h-full overflow-y-auto p-5">
                  <div className="mb-4 grid grid-cols-4 gap-2 text-xs" aria-label="Workspace graph summary">
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <span className="block truncate text-[10px] uppercase tracking-[0.1em] text-violet-200/60">
                        Entities
                      </span>
                      <strong className="mt-1 block truncate text-sm text-slate-50">
                        {formatCount(workspaceGraphEntities.length)}
                      </strong>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <span className="block truncate text-[10px] uppercase tracking-[0.1em] text-violet-200/60">
                        Relations
                      </span>
                      <strong className="mt-1 block truncate text-sm text-slate-50">
                        {formatCount(workspaceGraphEdges.length)}
                      </strong>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <span className="block truncate text-[10px] uppercase tracking-[0.1em] text-violet-200/60">
                        Visible nodes
                      </span>
                      <strong className="mt-1 block truncate text-sm text-slate-50">
                        {formatCount(workspaceGraph.nodes.length)}
                      </strong>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <span className="block truncate text-[10px] uppercase tracking-[0.1em] text-violet-200/60">
                        Visible links
                      </span>
                      <strong className="mt-1 block truncate text-sm text-slate-50">
                        {formatCount(workspaceGraph.links.length)}
                      </strong>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-violet-300/15 bg-slate-950/20 p-3">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-sm font-extrabold text-violet-100">
                          Document knowledge graph
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          Click an entity to inspect the document mentions used by Graph RAG.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!selectedGraphNodeId}
                        onClick={() => setSelectedGraphNodeId("")}
                        className="h-8 rounded-xl border border-white/10 bg-white/10 px-3 text-xs text-slate-100 hover:bg-white/15 disabled:opacity-40"
                      >
                        Clear selection
                      </Button>
                    </div>

                    <div
                      className="h-[420px] w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950/35"
                      role="img"
                      aria-label="Workspace document graph visualization"
                    >
                      {isLoadingWorkspaceGraph ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-300">
                          Loading workspace graph…
                        </div>
                      ) : workspaceGraph.nodes.length === 0 ? (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                          No graph entities yet. Process PDF, TXT, MD, or CSV files to generate the workspace graph.
                        </div>
                      ) : (
                        <ForceGraph2D<WorkspaceGraphNode, WorkspaceGraphLink>
                          graphData={workspaceGraph}
                          width={940}
                          height={420}
                          backgroundColor="rgba(15, 23, 42, 0.35)"
                          cooldownTicks={90}
                          nodeRelSize={5}
                          nodeLabel={(node) => `${node.name}${node.documentName ? ` · ${node.documentName}` : ""}`}
                          nodeColor={(node) => node.selected ? "#c4b5fd" : node.type === "metric" ? "#34d399" : "#38bdf8"}
                          linkColor={(link) => link.selected ? "#ddd6fe" : "rgba(167, 139, 250, 0.42)"}
                          linkLabel={(link) => `${link.type} · confidence ${link.confidence.toFixed(2)}`}
                          linkDirectionalParticles={(link) => link.selected ? 3 : 0}
                          linkDirectionalParticleWidth={2}
                          linkWidth={(link) => link.selected ? 2.6 : Math.max(1, Math.min(3, link.weight / 2))}
                          onNodeClick={(node) => {
                            if (typeof node.id === "string") {
                              setSelectedGraphNodeId(node.id)
                            }
                          }}
                          nodeCanvasObject={(node, canvasContext, globalScale) => {
                            const graphNode = node as NodeObject<WorkspaceGraphNode>
                            const label = graphNode.name
                            const fontSize = Math.max(9, 12 / globalScale)
                            const radius = graphNode.selected ? 7 : 5

                            canvasContext.beginPath()
                            canvasContext.arc(graphNode.x ?? 0, graphNode.y ?? 0, radius, 0, 2 * Math.PI)
                            canvasContext.fillStyle = graphNode.selected ? "#8b5cf6" : graphNode.type === "metric" ? "#064e3b" : "#0f172a"
                            canvasContext.fill()
                            canvasContext.strokeStyle = graphNode.selected ? "#ddd6fe" : graphNode.type === "metric" ? "#34d399" : "#38bdf8"
                            canvasContext.lineWidth = graphNode.selected ? 2.4 : 1.4
                            canvasContext.stroke()
                            canvasContext.font = `${fontSize}px Inter, system-ui, sans-serif`
                            canvasContext.fillStyle = "#e0f2fe"
                            canvasContext.textAlign = "center"
                            canvasContext.textBaseline = "top"
                            canvasContext.fillText(
                              label.length > 24 ? `${label.slice(0, 24)}…` : label,
                              graphNode.x ?? 0,
                              (graphNode.y ?? 0) + radius + 4
                            )
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {selectedGraphEntity ? (
                    <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200" aria-label="Selected graph entity details">
                      <p className="font-bold text-violet-100">{selectedGraphEntity.name}</p>
                      <p className="mt-1 text-slate-400">
                        {selectedGraphEntity.type} · confidence {selectedGraphEntity.confidence.toFixed(2)} · {documentNameById.get(selectedGraphEntity.documentId ?? "") ?? "Unknown file"}
                      </p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {selectedGraphEntity.mentions.slice(0, 4).map((mention) => (
                          <div key={`${mention.chunkId}-${mention.text}`} className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-200/60">
                              Pages {formatPageNumbers(mention.pageNumbers)}
                            </p>
                            <p className="mt-2 text-slate-200">{formatTextPreview(mention.text)}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="ontology" className="m-0 min-h-0 flex-1">
                <OntologyEditorTab
                  workspaceId={workspaceId}
                  entities={workspaceGraphEntities}
                  edges={workspaceGraphEdges}
                  documentNameById={documentNameById}
                  isLoading={isLoadingWorkspaceGraph}
                  onRefresh={refreshWorkspaceGraph}
                />
              </TabsContent>
            </Tabs>

            <div className="sticky bottom-0 z-10 mt-auto grid shrink-0 grid-cols-1 gap-3 border-t border-white/10 bg-[#111b4b]/95 p-4 backdrop-blur sm:grid-cols-3">
              <Button
                type="button"
                variant="secondary"
                aria-label="Close workspace management"
                onClick={() => setIsManagingWorkspace(false)}
                className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
              >
                Close
              </Button>
              <Button
                type="button"
                variant="destructive"
                aria-label="Delete workspace from management"
                onClick={handleConfirmDelete}
                className="rounded-xl border border-rose-300/25 bg-rose-500/20 text-rose-50 hover:bg-rose-500/30"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Workspace
              </Button>
              <Button
                type="button"
                variant="destructive"
                aria-label="Delete all files"
                disabled={documents.length === 0 || !onDeleteAllDocuments}
                onClick={() => void handleDeleteAllDocuments()}
                className="rounded-xl border border-amber-300/25 bg-amber-500/15 text-amber-50 hover:bg-amber-500/25 disabled:opacity-50"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete all files
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {previewDocument ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`File preview for ${previewDocument.name}`}
        >
          <div className="flex h-[82vh] max-h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111b4b] text-white shadow-[0_24px_70px_rgba(0,0,0,.55)]">
            <div className="border-b border-white/10 p-5">
              <div className="flex items-start gap-4">
                <FilePreviewIcon tone={getDisplayTone(previewDocument)} size="large" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                    File preview
                  </p>
                  <h2 className="mt-2 break-words text-lg font-extrabold leading-tight">
                    {previewDocument.name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-300">
                    {formatFileSize(previewDocument.size)} · {previewMimeType || "Unknown type"}
                  </p>
                </div>
              </div>
            </div>

            <Tabs value={previewTab} onValueChange={setPreviewTab} className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-white/10 px-5 pt-4">
                <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 text-slate-200">
                  <TabsTrigger
                    value="original"
                    onClick={() => setPreviewTab("original")}
                    className="rounded-xl px-4 py-2.5 text-xs font-bold transition data-[state=active]:border data-[state=active]:border-blue-400/30 data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500/25 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=inactive]:border data-[state=inactive]:border-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-300"
                  >
                    Original file
                  </TabsTrigger>
                  <TabsTrigger
                    value="raw"
                    onClick={() => setPreviewTab("raw")}
                    className="rounded-xl px-4 py-2.5 text-xs font-bold transition data-[state=active]:border data-[state=active]:border-blue-400/30 data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500/25 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=inactive]:border data-[state=inactive]:border-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-300"
                  >
                    Raw extracted text
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="original" className="m-0 min-h-0 flex-1 p-5">
                <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/25">
                  {previewMimeType === "application/pdf" ? (
                    <iframe
                      src={previewDocumentUrl}
                      title={`Original preview for ${previewDocument.name}`}
                      className="h-full min-h-[420px] w-full bg-white"
                    />
                  ) : previewMimeType.startsWith("image/") ? (
                    <div className="app-scrollbar flex h-full w-full items-center justify-center overflow-auto p-4">
                      <img
                        src={previewDocumentUrl}
                        alt={`Original preview for ${previewDocument.name}`}
                        className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
                      />
                    </div>
                  ) : previewOriginalText ? (
                    <pre className="app-scrollbar h-full w-full overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-7 text-slate-100">
                      {previewOriginalText}
                    </pre>
                  ) : (
                    <div className="flex h-full min-h-[320px] w-full items-center justify-center p-6 text-center">
                      <div className="max-w-md rounded-2xl border border-dashed border-white/15 bg-white/5 p-6">
                        <p className="text-sm font-bold text-slate-50">
                          Original preview is not available for this file type.
                        </p>
                        <p className="mt-2 text-xs leading-6 text-slate-300">
                          Use the raw extracted text tab to inspect the content generated during processing.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="raw" className="m-0 min-h-0 flex-1 p-5">
                <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/25">
                  {isLoadingPreview ? (
                    <div className="flex h-full min-h-[320px] w-full items-center justify-center text-sm text-slate-300">
                      Loading extracted text…
                    </div>
                  ) : rawExtractedText ? (
                    <pre className="app-scrollbar h-full w-full overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-7 text-slate-100">
                      {rawExtractedText}
                    </pre>
                  ) : (
                    <div className="flex h-full min-h-[320px] w-full items-center justify-center px-6 text-center text-sm text-slate-300">
                      No extracted raw text is available for this file yet.
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 justify-end border-t border-white/10 bg-[#111b4b]/95 p-4 backdrop-blur">
              <Button
                type="button"
                variant="secondary"
                aria-label="Close file preview"
                onClick={handleClosePreview}
                className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDocument ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`File details for ${selectedDocument.name}`}
        >
          <div className="flex h-[80vh] max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111b4b] text-white shadow-[0_24px_70px_rgba(0,0,0,.55)]">
            <div className="app-scrollbar overflow-y-auto p-5">
              <div className="flex items-start gap-4">
                <FilePreviewIcon tone={getDisplayTone(selectedDocument)} size="large" />

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                    File details
                  </p>
                  <h2 className="mt-2 break-words text-lg font-extrabold leading-tight">
                    {selectedDocument.name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-300">
                    {formatFileSize(selectedDocument.size)}
                  </p>
                  <dl className="mt-4 grid grid-cols-4 gap-2 text-xs">
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <dt className="truncate text-[10px] uppercase tracking-[0.1em] text-sky-200/60">
                        Chunks
                      </dt>
                      <dd className="mt-1 truncate text-sm font-bold text-slate-50">
                        {formatCount(selectedDocument.chunkCount)}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <dt className="truncate text-[10px] uppercase tracking-[0.1em] text-sky-200/60">
                        Pages
                      </dt>
                      <dd className="mt-1 truncate text-sm font-bold text-slate-50">
                        {formatCount(selectedDocument.pageCount)}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <dt className="truncate text-[10px] uppercase tracking-[0.1em] text-sky-200/60">
                        Parent chunks
                      </dt>
                      <dd className="mt-1 truncate text-sm font-bold text-slate-50">
                        {formatCount(selectedDocument.parentChunkCount)}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <dt className="truncate text-[10px] uppercase tracking-[0.1em] text-sky-200/60">
                        Child chunks
                      </dt>
                      <dd className="mt-1 truncate text-sm font-bold text-slate-50">
                        {formatCount(selectedDocument.childChunkCount)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <section
                className="mt-5 rounded-2xl border border-white/10 bg-slate-950/20"
                aria-label="Document chunks"
              >
                <Tabs
                  value={activeChunkTab}
                  onValueChange={setActiveChunkTab}
                  className="flex flex-col gap-0"
                >
                  <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-50">
                        Chunks and embeddings
                      </h3>
                      <p className="mt-1 text-xs text-sky-200/70">
                        Parent chunks preserve page context; child chunks store embeddings.
                      </p>
                    </div>
                    <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 text-slate-200">
                      <TabsTrigger
                        value="parents"
                        onClick={() => setActiveChunkTab("parents")}
                        className="rounded-xl px-4 py-2.5 text-xs font-bold transition data-[state=active]:border data-[state=active]:border-blue-400/30 data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500/25 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=inactive]:border data-[state=inactive]:border-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-300"
                      >
                        Parent chunks ({parentChunks.length})
                      </TabsTrigger>
                      <TabsTrigger
                        value="children"
                        onClick={() => setActiveChunkTab("children")}
                        className="rounded-xl px-4 py-2.5 text-xs font-bold transition data-[state=active]:border data-[state=active]:border-blue-400/30 data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500/25 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=inactive]:border data-[state=inactive]:border-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-300"
                      >
                        Chunks ({childChunks.length})
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="parents" className="m-0">
                    <div className="app-scrollbar overflow-x-auto">
                      <table
                        className="min-w-[860px] table-fixed text-left text-xs"
                        aria-label="Parent chunks table"
                      >
                        <thead className="bg-white/5 text-[11px] uppercase tracking-[0.12em] text-sky-200/70">
                          <tr>
                            <th className="w-16 px-3 py-3 font-bold">#</th>
                            <th className="w-28 px-3 py-3 font-bold">Pages</th>
                            <th className="w-64 px-3 py-3 font-bold">Parent chunk ID</th>
                            <th className="w-28 px-3 py-3 font-bold">Child count</th>
                            <th className="w-24 px-3 py-3 font-bold">Chars</th>
                            <th className="w-80 px-3 py-3 font-bold">Text preview</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {isLoadingChunks ? (
                            <tr>
                              <td className="px-3 py-5 text-center text-slate-300" colSpan={6}>
                                Loading parent chunks…
                              </td>
                            </tr>
                          ) : paginatedParentChunks.length > 0 ? (
                            paginatedParentChunks.map((chunk) => (
                              <tr key={chunk.id} className="align-top text-slate-200">
                                <td className="px-3 py-3 font-semibold text-slate-100">
                                  {chunk.order + 1}
                                </td>
                                <td className="px-3 py-3">
                                  {formatPageNumbers(chunk.pageNumbers)}
                                </td>
                                <td className="px-3 py-3 font-mono text-[11px] text-sky-100/90">
                                  <span className="line-clamp-2 break-all" title={chunk.chunkId}>
                                    {chunk.chunkId}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  {childCountByParentId.get(chunk.chunkId) ?? 0}
                                </td>
                                <td className="px-3 py-3">{chunk.text.length}</td>
                                <td className="px-3 py-3 text-slate-300" title={chunk.text}>
                                  {formatTextPreview(chunk.text)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-3 py-5 text-center text-slate-300" colSpan={6}>
                                No stored parent chunks for this file yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-slate-300">
                        {parentChunks.length > 0
                          ? `Showing ${((parentChunkPage - 1) * CHUNKS_PER_PAGE) + 1}-${Math.min(parentChunkPage * CHUNKS_PER_PAGE, parentChunks.length)} of ${parentChunks.length} parent chunks`
                          : "The table will populate after file processing completes."}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:w-auto">
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label="Previous parent chunks page"
                          disabled={parentChunkPage <= 1 || parentChunks.length === 0}
                          onClick={() => setParentChunkPage((page) => Math.max(1, page - 1))}
                          className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15 disabled:opacity-50"
                        >
                          <ChevronLeft className="mr-2 h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label="Next parent chunks page"
                          disabled={parentChunkPage >= parentChunkPageCount || parentChunks.length === 0}
                          onClick={() => setParentChunkPage((page) => Math.min(parentChunkPageCount, page + 1))}
                          className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15 disabled:opacity-50"
                        >
                          Next
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="children" className="m-0">
                    <div className="app-scrollbar overflow-x-auto">
                      <table
                        className="min-w-[980px] table-fixed text-left text-xs"
                        aria-label="Child chunks table"
                      >
                        <thead className="bg-white/5 text-[11px] uppercase tracking-[0.12em] text-sky-200/70">
                          <tr>
                            <th className="w-16 px-3 py-3 font-bold">#</th>
                            <th className="w-28 px-3 py-3 font-bold">Pages</th>
                            <th className="w-56 px-3 py-3 font-bold">Chunk ID</th>
                            <th className="w-56 px-3 py-3 font-bold">Parent ID</th>
                            <th className="w-64 px-3 py-3 font-bold">Text preview</th>
                            <th className="w-24 px-3 py-3 font-bold">Dims</th>
                            <th className="w-56 px-3 py-3 font-bold">Embedding preview</th>
                            <th className="w-48 px-3 py-3 font-bold">Model</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {isLoadingChunks ? (
                            <tr>
                              <td className="px-3 py-5 text-center text-slate-300" colSpan={8}>
                                Loading chunks…
                              </td>
                            </tr>
                          ) : paginatedChildChunks.length > 0 ? (
                            paginatedChildChunks.map((chunk) => (
                              <tr key={chunk.id} className="align-top text-slate-200">
                                <td className="px-3 py-3 font-semibold text-slate-100">
                                  {chunk.order + 1}
                                </td>
                                <td className="px-3 py-3">
                                  {formatPageNumbers(chunk.pageNumbers)}
                                </td>
                                <td className="px-3 py-3 font-mono text-[11px] text-sky-100/90">
                                  <span className="line-clamp-2 break-all" title={chunk.chunkId}>
                                    {chunk.chunkId}
                                  </span>
                                </td>
                                <td className="px-3 py-3 font-mono text-[11px] text-slate-400">
                                  <span className="line-clamp-2 break-all" title={chunk.parentChunkId ?? "No parent"}>
                                    {chunk.parentChunkId ?? "—"}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-slate-300" title={chunk.text}>
                                  {formatTextPreview(chunk.text)}
                                </td>
                                <td className="px-3 py-3">{chunk.embeddingDimensions ?? "—"}</td>
                                <td
                                  className="px-3 py-3 font-mono text-[11px] text-emerald-100/90"
                                  title={chunk.embedding?.join(", ") ?? "No embedding"}
                                >
                                  {formatEmbeddingPreview(chunk.embedding)}
                                </td>
                                <td className="px-3 py-3 text-slate-300">
                                  <span className="line-clamp-2 break-all" title={chunk.embeddingModel ?? "No embedding model"}>
                                    {chunk.embeddingModel ?? "—"}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-3 py-5 text-center text-slate-300" colSpan={8}>
                                No stored chunks for this file yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-slate-300">
                        {childChunks.length > 0
                          ? `Showing ${((childChunkPage - 1) * CHUNKS_PER_PAGE) + 1}-${Math.min(childChunkPage * CHUNKS_PER_PAGE, childChunks.length)} of ${childChunks.length} chunks`
                          : "The table will populate after file processing completes."}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:w-auto">
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label="Previous chunks page"
                          disabled={childChunkPage <= 1 || childChunks.length === 0}
                          onClick={() => setChildChunkPage((page) => Math.max(1, page - 1))}
                          className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15 disabled:opacity-50"
                        >
                          <ChevronLeft className="mr-2 h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label="Next chunks page"
                          disabled={childChunkPage >= childChunkPageCount || childChunks.length === 0}
                          onClick={() => setChildChunkPage((page) => Math.min(childChunkPageCount, page + 1))}
                          className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15 disabled:opacity-50"
                        >
                          Next
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </section>
            </div>

            <div className="sticky bottom-0 z-10 mt-auto grid shrink-0 grid-cols-1 gap-3 border-t border-white/10 bg-[#111b4b]/95 p-4 backdrop-blur sm:grid-cols-3">
              <Button
                type="button"
                variant="secondary"
                aria-label="Close file details"
                onClick={() => setSelectedDocumentId(null)}
                className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
              >
                Close
              </Button>
              <Button
                type="button"
                variant="secondary"
                aria-label={`Reprocess ${selectedDocument.name}`}
                onClick={() => void handleReprocessDocument()}
                disabled={!onReprocessDocument}
                className="rounded-xl border border-amber-200/20 bg-amber-400/10 text-amber-50 hover:bg-amber-400/20 disabled:opacity-50"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reprocess
              </Button>
              <Button
                type="button"
                variant="destructive"
                aria-label={`Delete ${selectedDocument.name}`}
                onClick={() => void handleDeleteDocument()}
                className="rounded-xl border border-rose-300/25 bg-rose-500/20 text-rose-50 hover:bg-rose-500/30"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  )
}