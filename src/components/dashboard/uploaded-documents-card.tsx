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

  function handleUploadClick() {
    setStatusMessage("File upload is not connected yet.")
  }

  function handleManageClick() {
    setStatusMessage("Workspace document management is not connected yet.")
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
            onClick={onDeleteWorkspace}
            className="mt-3 w-full rounded-xl border border-rose-400/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {deleteLabel}
          </Button>
        ) : null}

        <p className="mt-3 min-h-4 text-xs text-sky-200/75" role="status">
          {statusMessage}
        </p>
      </CardContent>
    </Card>
  )
}