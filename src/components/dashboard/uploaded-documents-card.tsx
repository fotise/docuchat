import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getDocumentChunks,
  type StoredDocumentChunk,
} from "@/lib/chat-history/indexed-db"
import type { UploadedDocument } from "@/types/dashboard"
import { DocumentMiniCard } from "./document-mini-card"
import { FilePreviewIcon } from "./file-preview-icon"

const CHUNKS_PER_PAGE = 10

interface UploadedDocumentsCardProps {
  title: string
  uploadLabel: string
  manageLabel: string
  documents: UploadedDocument[]
  deleteLabel?: string
  onUploadFiles?: (files: File[]) => Promise<void> | void
  onDeleteDocument?: (documentId: string) => Promise<void> | void
  onReprocessDocument?: (documentId: string) => Promise<void> | void
  onDeleteWorkspace?: () => void
}

export function UploadedDocumentsCard({
  title,
  uploadLabel,
  manageLabel,
  documents,
  deleteLabel = "Delete Workspace",
  onUploadFiles,
  onDeleteDocument,
  onReprocessDocument,
  onDeleteWorkspace,
}: UploadedDocumentsCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [chunkPage, setChunkPage] = useState(1)
  const [documentChunks, setDocumentChunks] = useState<StoredDocumentChunk[]>([])
  const [isLoadingChunks, setIsLoadingChunks] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const selectedDocument = documents.find(
    (document) => document.id === selectedDocumentId
  ) ?? null
  const chunkPageCount = Math.max(1, Math.ceil(documentChunks.length / CHUNKS_PER_PAGE))
  const paginatedChunks = useMemo(
    () => documentChunks.slice((chunkPage - 1) * CHUNKS_PER_PAGE, chunkPage * CHUNKS_PER_PAGE),
    [chunkPage, documentChunks]
  )

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

  function handleOpenDocument(documentId: string) {
    setSelectedDocumentId(documentId)
    setChunkPage(1)
    setDocumentChunks([])
    setIsLoadingChunks(true)
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
    setStatusMessage("Workspace document management is not connected yet.")
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
    onDeleteWorkspace?.()
  }

  async function handleDeleteDocument() {
    if (!selectedDocument || !onDeleteDocument) {
      return
    }

    const deletedName = selectedDocument.name

    await onDeleteDocument(selectedDocument.id)
    setSelectedDocumentId(null)
    setStatusMessage(`Deleted ${deletedName} from this workspace.`)
  }

  async function handleReprocessDocument() {
    if (!selectedDocument || !onReprocessDocument) {
      return
    }

    await onReprocessDocument(selectedDocument.id)
    setChunkPage(1)
    setDocumentChunks([])
    setIsLoadingChunks(false)
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

      {selectedDocument ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`File details for ${selectedDocument.name}`}
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111b4b] text-white shadow-[0_24px_70px_rgba(0,0,0,.55)]">
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
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <dt className="text-xs uppercase tracking-[0.14em] text-sky-200/60">
                        Chunks
                      </dt>
                      <dd className="mt-1 font-bold text-slate-50">
                        {formatCount(selectedDocument.chunkCount)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <dt className="text-xs uppercase tracking-[0.14em] text-sky-200/60">
                        Pages
                      </dt>
                      <dd className="mt-1 font-bold text-slate-50">
                        {formatCount(selectedDocument.pageCount)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <dt className="text-xs uppercase tracking-[0.14em] text-sky-200/60">
                        Parent chunks
                      </dt>
                      <dd className="mt-1 font-bold text-slate-50">
                        {formatCount(selectedDocument.parentChunkCount)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <dt className="text-xs uppercase tracking-[0.14em] text-sky-200/60">
                        Child chunks
                      </dt>
                      <dd className="mt-1 font-bold text-slate-50">
                        {formatCount(selectedDocument.childChunkCount)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <section className="mt-5 rounded-2xl border border-white/10 bg-slate-950/20" aria-label="Document chunks">
                <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-50">Chunks and embeddings</h3>
                    <p className="mt-1 text-xs text-sky-200/70">
                      Showing stored parent/child chunks, page references and embedding metadata.
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-slate-300" aria-live="polite">
                    {documentChunks.length === 0
                      ? "No chunks available"
                      : `Page ${chunkPage} of ${chunkPageCount}`}
                  </p>
                </div>

                <div className="app-scrollbar overflow-x-auto">
                  <table className="min-w-[920px] table-fixed text-left text-xs" aria-label="Document chunks table">
                    <thead className="bg-white/5 text-[11px] uppercase tracking-[0.12em] text-sky-200/70">
                      <tr>
                        <th className="w-16 px-3 py-3 font-bold">#</th>
                        <th className="w-20 px-3 py-3 font-bold">Level</th>
                        <th className="w-28 px-3 py-3 font-bold">Pages</th>
                        <th className="w-56 px-3 py-3 font-bold">Chunk ID</th>
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
                      ) : paginatedChunks.length > 0 ? (
                        paginatedChunks.map((chunk) => (
                          <tr key={chunk.id} className="align-top text-slate-200">
                            <td className="px-3 py-3 font-semibold text-slate-100">{chunk.order + 1}</td>
                            <td className="px-3 py-3 capitalize">
                              <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1">
                                {chunk.level}
                              </span>
                            </td>
                            <td className="px-3 py-3">{formatPageNumbers(chunk.pageNumbers)}</td>
                            <td className="px-3 py-3 font-mono text-[11px] text-sky-100/90">
                              <span className="line-clamp-2 break-all" title={chunk.chunkId}>
                                {chunk.chunkId}
                              </span>
                              {chunk.parentChunkId ? (
                                <span className="mt-1 block text-[10px] text-slate-400" title={chunk.parentChunkId}>
                                  Parent: {chunk.parentChunkId}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-slate-300" title={chunk.text}>
                              {formatTextPreview(chunk.text)}
                            </td>
                            <td className="px-3 py-3">{chunk.embeddingDimensions ?? "—"}</td>
                            <td className="px-3 py-3 font-mono text-[11px] text-emerald-100/90" title={chunk.embedding?.join(", ") ?? "No embedding"}>
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
                    {documentChunks.length > 0
                      ? `Showing ${((chunkPage - 1) * CHUNKS_PER_PAGE) + 1}-${Math.min(chunkPage * CHUNKS_PER_PAGE, documentChunks.length)} of ${documentChunks.length} chunks`
                      : "The table will populate after file processing completes."}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:w-auto">
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label="Previous chunks page"
                      disabled={chunkPage <= 1 || documentChunks.length === 0}
                      onClick={() => setChunkPage((page) => Math.max(1, page - 1))}
                      className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15 disabled:opacity-50"
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label="Next chunks page"
                      disabled={chunkPage >= chunkPageCount || documentChunks.length === 0}
                      onClick={() => setChunkPage((page) => Math.min(chunkPageCount, page + 1))}
                      className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15 disabled:opacity-50"
                    >
                      Next
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-white/10 bg-white/5 p-4 sm:grid-cols-3">
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