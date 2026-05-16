import { createPortal } from "react-dom"
import { useEffect, useId, useRef, useState } from "react"
import type { UploadedDocument } from "@/types/dashboard"
import { FilePreviewIcon } from "./file-preview-icon"

type DocumentMiniCardProps = Pick<
  UploadedDocument,
  | "childChunkCount"
  | "chunkCount"
  | "name"
  | "parentChunkCount"
  | "processingStatus"
  | "size"
  | "tone"
  | "toBeProcessed"
> & {
  onClick?: () => void
}

const FILE_CARD_TOOLTIP_OPEN_EVENT = "docuchat:file-card-tooltip-open"

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

function getStatusLabel(
  processingStatus: UploadedDocument["processingStatus"],
  toBeProcessed?: boolean
) {
  if (processingStatus === "processing") {
    return "Processing"
  }

  if (processingStatus === "error") {
    return "Error"
  }

  if (processingStatus === "toBeProcessed" || toBeProcessed) {
    return "To be processed"
  }

  return "Processed"
}

export function DocumentMiniCard({
  childChunkCount,
  chunkCount,
  name,
  parentChunkCount,
  size,
  toBeProcessed,
  processingStatus,
  onClick,
}: DocumentMiniCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null)
  const instanceId = useId()
  const tooltipId = `${instanceId}-tooltip`
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const displayTone =
    processingStatus === "error"
      ? "red"
      : toBeProcessed || processingStatus === "processing"
        ? "gray"
        : "blue"
  const sizeLabel = formatFileSize(size)
  const statusLabel = getStatusLabel(processingStatus, toBeProcessed)
  const chunksLabel = typeof chunkCount === "number" ? chunkCount : "Unavailable"

  function updateTooltipPosition() {
    const card = cardRef.current

    if (!card) {
      return
    }

    const rect = card.getBoundingClientRect()

    setTooltipPosition({
      left: rect.left + rect.width / 2,
      top: rect.bottom + 8,
    })
  }

  function showTooltip() {
    window.dispatchEvent(
      new CustomEvent(FILE_CARD_TOOLTIP_OPEN_EVENT, {
        detail: { instanceId },
      })
    )
    updateTooltipPosition()
  }

  function hideTooltip() {
    setTooltipPosition(null)
  }

  useEffect(() => {
    function handleTooltipOpen(event: Event) {
      const customEvent = event as CustomEvent<{ instanceId: string }>

      if (customEvent.detail.instanceId !== instanceId) {
        hideTooltip()
      }
    }

    window.addEventListener(FILE_CARD_TOOLTIP_OPEN_EVENT, handleTooltipOpen)

    return () => {
      window.removeEventListener(FILE_CARD_TOOLTIP_OPEN_EVENT, handleTooltipOpen)
    }
  }, [instanceId])

  useEffect(() => {
    if (!tooltipPosition) {
      return
    }

    window.addEventListener("scroll", hideTooltip, true)
    window.addEventListener("resize", hideTooltip)

    return () => {
      window.removeEventListener("scroll", hideTooltip, true)
      window.removeEventListener("resize", hideTooltip)
    }
  }, [tooltipPosition])

  return (
    <>
      <button
        ref={cardRef}
        type="button"
        aria-label={`Open details for ${name}`}
        aria-describedby={tooltipPosition ? tooltipId : undefined}
        onBlur={hideTooltip}
        onClick={onClick}
        onFocus={showTooltip}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="relative h-28 w-full cursor-pointer rounded-xl border border-white/10 bg-white/5 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,.45)] transition hover:border-sky-300/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
      >
        <div className="mb-2">
          <FilePreviewIcon tone={displayTone} size="large" />
        </div>

        <div className="truncate text-[11px] leading-4 text-slate-200">
          {name}
        </div>
      </button>

      {tooltipPosition
        ? createPortal(
            <div
              id={tooltipId}
              className="pointer-events-none fixed z-[9999] w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950/95 p-3 text-left text-xs font-medium text-slate-100 shadow-[0_18px_45px_rgba(0,0,0,.5)]"
              role="tooltip"
              style={{
                left: tooltipPosition.left,
                top: tooltipPosition.top,
              }}
            >
              <span className="block truncate">Name: {name}</span>
              <span className="mt-1 block">Size: {sizeLabel}</span>
              <span className="mt-1 block">Status: {statusLabel}</span>
              <span className="mt-1 block">Chunks: {chunksLabel}</span>
              {typeof parentChunkCount === "number" || typeof childChunkCount === "number" ? (
                <span className="mt-1 block">
                  Parent/child: {parentChunkCount ?? 0}/{childChunkCount ?? 0}
                </span>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  )
}