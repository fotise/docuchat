import type { UploadedDocument } from "@/types/dashboard"
import { FilePreviewIcon } from "./file-preview-icon"

type DocumentMiniCardProps = Pick<UploadedDocument, "name" | "tone">

export function DocumentMiniCard({
  name,
  tone,
}: DocumentMiniCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 shadow-[0_10px_30px_rgba(0,0,0,.45)]">
      <div className="mb-2">
        <FilePreviewIcon tone={tone} size="large" />
      </div>

      <div className="break-words text-[11px] leading-4 text-slate-200">
        {name}
      </div>
    </div>
  )
}