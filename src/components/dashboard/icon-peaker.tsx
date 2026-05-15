import { useEffect, useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { IconKey } from "@/types/dashboard"
import { AppIcon } from "./icon"

const ICON_PEAKER_OPEN_EVENT = "docuchat:icon-peaker-open"

interface IconOption {
  key: IconKey
  label: string
}

const iconOptions: IconOption[] = [
  { key: "folderKanban", label: "Folder" },
  { key: "fileText", label: "Document" },
  { key: "scale", label: "Legal" },
  { key: "briefcase", label: "Business" },
  { key: "mail", label: "Message" },
  { key: "search", label: "Search" },
  { key: "shield", label: "Secure" },
  { key: "compass", label: "Explore" },
]

interface IconPeakerProps {
  value: IconKey
  workspaceTitle: string
  ariaLabel?: string
  variant?: "header" | "sidebar"
  onChange: (value: IconKey) => void
}

export function IconPeaker({
  value,
  workspaceTitle,
  ariaLabel,
  variant = "header",
  onChange,
}: IconPeakerProps) {
  const instanceId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const currentOption = iconOptions.find((option) => option.key === value)

  useEffect(() => {
    function handleIconPeakerOpen(event: Event) {
      const openedInstanceId = (event as CustomEvent<string>).detail

      if (openedInstanceId !== instanceId) {
        setIsOpen(false)
      }
    }

    window.addEventListener(ICON_PEAKER_OPEN_EVENT, handleIconPeakerOpen)

    return () => {
      window.removeEventListener(ICON_PEAKER_OPEN_EVENT, handleIconPeakerOpen)
    }
  }, [instanceId])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      if (
        target instanceof Node &&
        !containerRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("pointerdown", handlePointerDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [isOpen])

  function toggleOpen() {
    setIsOpen((open) => {
      const nextOpen = !open

      if (nextOpen) {
        window.dispatchEvent(
          new CustomEvent(ICON_PEAKER_OPEN_EVENT, { detail: instanceId })
        )
      }

      return nextOpen
    })
  }

  function handleSelect(icon: IconKey) {
    onChange(icon)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={ariaLabel ?? `Change icon for ${workspaceTitle}`}
        title="Change workspace icon"
        onClick={toggleOpen}
        className={cn(
          "flex items-center justify-center outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400",
          variant === "header"
            ? "h-9 w-9 rounded-xl border border-sky-400/20 bg-gradient-to-br from-sky-400/20 to-sky-400/5 text-sky-300 hover:from-sky-400/30 hover:to-sky-400/10"
            : "h-4 w-4 shrink-0 rounded text-slate-200 hover:text-sky-300"
        )}
      >
        <AppIcon name={value} className="h-4 w-4" />
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute left-0 z-30 w-52 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur",
            variant === "header" ? "top-11" : "top-7"
          )}
        >
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Workspace icon
          </div>

          <div className="grid grid-cols-2 gap-1">
            {iconOptions.map((option) => {
              const isSelected = option.key === value

              return (
                <button
                  key={option.key}
                  type="button"
                  aria-label={`Use ${option.label} icon`}
                  aria-pressed={isSelected}
                  onClick={() => handleSelect(option.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-2 py-2 text-xs text-slate-100 transition hover:bg-white/10",
                    isSelected
                      ? "border-sky-400/40 bg-sky-400/15"
                      : "border-transparent bg-white/[0.03]"
                  )}
                >
                  <AppIcon name={option.key} className="h-3.5 w-3.5" />
                  <span className="truncate">{option.label}</span>
                </button>
              )
            })}
          </div>

          <div className="px-2 pt-2 text-[11px] text-slate-500">
            Current: {currentOption?.label ?? value}
          </div>
        </div>
      ) : null}
    </div>
  )
}
