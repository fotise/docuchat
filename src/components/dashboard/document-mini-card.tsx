import type { UploadedDocument } from "@/types/dashboard"
import { FilePreviewIcon } from "./file-preview-icon"

type DocumentMiniCardProps = Pick<UploadedDocument, "name" | "tone" | "toBeProcessed"> & {
  onClick?: () => void
}

export function DocumentMiniCard({
  name,
  toBeProcessed,
  onClick,
}: DocumentMiniCardProps) {
  const displayTone = toBeProcessed ? "gray" : "blue"

  return (
    <button
      type="button"
      aria-label={`Open details for ${name}`}
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-white/10 bg-white/5 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,.45)] transition hover:border-sky-300/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
    >
      <div className="mb-2">
        <FilePreviewIcon tone={displayTone} size="large" />
      </div>

      <div className="break-words text-[11px] leading-4 text-slate-200">
        {name}
      </div>
    </button>
  )
}