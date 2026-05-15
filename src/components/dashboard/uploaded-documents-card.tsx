import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { Settings, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { UploadedDocument } from "@/types/dashboard"
import { DocumentMiniCard } from "./document-mini-card"
import { FilePreviewIcon } from "./file-preview-icon"

interface UploadedDocumentsCardProps {
  title: string
  uploadLabel: string
  manageLabel: string
  documents: UploadedDocument[]
  deleteLabel?: string
  onUploadFiles?: (files: File[]) => Promise<void> | void
  onDeleteDocument?: (documentId: string) => Promise<void> | void
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
  onDeleteWorkspace,
}: UploadedDocumentsCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<UploadedDocument | null>(null)

  useEffect(() => {
    if (!selectedDocument) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedDocument(null)
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectedDocument])

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
    setSelectedDocument(null)
    setStatusMessage(`Deleted ${deletedName} from this workspace.`)
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

  return (
    <Card className="rounded-[18px] border-white/10 bg-[linear-gradient(180deg,rgba(18,28,79,.92),rgba(12,20,58,.94))] text-white shadow-[0_10px_30px_rgba(0,0,0,.45)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-extrabold">
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">
          {documents.map((doc) => (
            <DocumentMiniCard
              key={doc.id}
              name={doc.name}
              tone={doc.tone}
              onClick={() => setSelectedDocument(doc)}
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
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#111b4b] text-white shadow-[0_24px_70px_rgba(0,0,0,.55)]">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <FilePreviewIcon tone={selectedDocument.tone} size="large" />

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
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-white/5 p-4">
              <Button
                type="button"
                variant="secondary"
                aria-label="Close file details"
                onClick={() => setSelectedDocument(null)}
                className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
              >
                Close
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