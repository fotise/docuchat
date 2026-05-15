import { useState } from "react"
import { Settings, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { UploadedDocument } from "@/types/dashboard"
import { DocumentMiniCard } from "./document-mini-card"

interface UploadedDocumentsCardProps {
  title: string
  uploadLabel: string
  manageLabel: string
  documents: UploadedDocument[]
  deleteLabel?: string
  onDeleteWorkspace?: () => void
}

export function UploadedDocumentsCard({
  title,
  uploadLabel,
  manageLabel,
  documents,
  deleteLabel = "Delete Workspace",
  onDeleteWorkspace,
}: UploadedDocumentsCardProps) {
  const [statusMessage, setStatusMessage] = useState("")
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  function handleUploadClick() {
    setIsConfirmingDelete(false)
    setStatusMessage("File upload is not connected yet.")
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
            />
          ))}
        </div>

        <Button
          aria-label={uploadLabel}
          onClick={handleUploadClick}
          className="mt-4 w-full rounded-xl bg-gradient-to-b from-blue-400 to-blue-700 text-white hover:from-blue-400 hover:to-blue-600"
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploadLabel}
        </Button>

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
    </Card>
  )
}