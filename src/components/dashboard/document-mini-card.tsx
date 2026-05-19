import { createPortal } from "react-dom"
import { useEffect, useId, useRef, useState } from "react"
import { Eye, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UploadedDocument } from "@/types/dashboard"
import { FilePreviewIcon } from "./file-preview-icon"

type DocumentMiniCardProps = Pick<
  UploadedDocument,
  | "childChunkCount"
  | "chunkCount"
  | "name"
  | "parentChunkCount"
  | "processingProgress"
  | "processingStatus"
  | "size"
  | "tone"
  | "toBeProcessed"
> & {
  onDeleteClick?: () => void
  onClick?: () => void
  onPreviewClick?: () => void
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
  toBeProcessed?: boolean,
  processingProgress?: number
) {
  const progressLabel = typeof processingProgress === "number" ? ` (${processingProgress}%)` : ""

  if (processingStatus === "processing") {
    return `Processing${progressLabel}`
  }

  if (processingStatus === "error") {
    return "Error"
  }

  if (processingStatus === "toBeProcessed" || toBeProcessed) {
    return `To be processed${progressLabel}`
  }

  return `Processed${progressLabel}`
}

function getProcessingProgress(
  processingStatus: UploadedDocument["processingStatus"],
  toBeProcessed?: boolean,
  processingProgress?: number
) {
  if (typeof processingProgress === "number") {
    return Math.min(100, Math.max(0, Math.round(processingProgress)))
  }

  if (processingStatus === "processed") {
    return 100
  }

  if (processingStatus === "toBeProcessed" || toBeProcessed) {
    return 0
  }

  return undefined
}

export function DocumentMiniCard({
  childChunkCount,
  chunkCount,
  name,
  parentChunkCount,
  processingProgress,
  size,
  toBeProcessed,
  processingStatus,
  onDeleteClick,
  onClick,
  onPreviewClick,
}: DocumentMiniCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null)
  const instanceId = useId()
  const tooltipId = `${instanceId}-tooltip`
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const isProcessing = processingStatus === "processing"
  const displayTone =
    processingStatus === "error"
      ? "red"
      : isProcessing
        ? "orange"
        : toBeProcessed
        ? "gray"
        : "blue"
  const sizeLabel = formatFileSize(size)
  const progressPercentage = getProcessingProgress(processingStatus, toBeProcessed, processingProgress)
  const statusLabel = getStatusLabel(processingStatus, toBeProcessed, progressPercentage)
  const chunksLabel = typeof chunkCount === "number" ? chunkCount : "Unavailable"
  const shouldShowProgress = processingStatus === "processing" || processingStatus === "toBeProcessed" || toBeProcessed

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
      <div
        className="group relative h-28 w-full"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
      >
        <button
          ref={cardRef}
          type="button"
          aria-label={`Open details for ${name}`}
          aria-describedby={tooltipPosition ? tooltipId : undefined}
          onBlur={hideTooltip}
          onClick={onClick}
          onFocus={showTooltip}
          className={cn(
            "relative flex h-28 w-full cursor-pointer flex-col rounded-xl border border-white/10 bg-white/5 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,.45)] transition hover:border-sky-300/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70",
            isProcessing && "animate-pulse border-orange-300/70 bg-orange-500/15 shadow-[0_0_32px_rgba(251,146,60,.28)] hover:border-orange-300/80 hover:bg-orange-500/20 focus-visible:ring-orange-300/70"
          )}
        >
          <div className="mb-2 shrink-0">
            <FilePreviewIcon tone={displayTone} size="large" />
          </div>

          <div className="min-w-0 truncate text-[11px] leading-4 text-slate-200">
            {name}
          </div>
          {shouldShowProgress && typeof progressPercentage === "number" ? (
            <div className="mt-auto pt-2" aria-label={`${name} processing progress ${progressPercentage}%`}>
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-orange-100">
                <span>{isProcessing ? "Processing" : "Queued"}</span>
                <span>{progressPercentage}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-900/70">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isProcessing ? "bg-orange-300" : "bg-slate-400"
                  )}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          ) : null}
        </button>

        {onPreviewClick ? (
          <button
            type="button"
            aria-label={`Preview ${name}`}
            title="Preview file"
            onClick={(event) => {
              event.stopPropagation()
              onPreviewClick()
            }}
            onFocus={showTooltip}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-sky-300/25 bg-slate-950/85 text-sky-100 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,.35)] transition hover:bg-sky-500/20 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 group-hover:opacity-100"
          >
            <Eye className="h-4 w-4" />
          </button>
        ) : null}

        {onDeleteClick ? (
          <button
            type="button"
            aria-label={`Delete ${name}`}
            title="Delete file"
            onClick={(event) => {
              event.stopPropagation()
              onDeleteClick()
            }}
            onFocus={showTooltip}
            className="absolute right-2 top-11 flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300/25 bg-slate-950/85 text-rose-100 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,.35)] transition hover:bg-rose-500/20 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

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