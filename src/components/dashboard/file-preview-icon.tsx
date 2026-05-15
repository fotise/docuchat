import { cn } from "@/lib/utils"
import type { UploadedDocTone } from "@/types/dashboard"

interface FilePreviewIconProps {
  tone?: UploadedDocTone
  size?: "small" | "large"
  className?: string
}

export function FilePreviewIcon({
  tone = "blue",
  size = "small",
  className,
}: FilePreviewIconProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-gradient-to-b from-white to-slate-200 p-1 shadow-sm",
        size === "small" ? "h-9 w-9" : "h-14 w-11",
        className
      )}
    >
      <div className="relative h-full w-full rounded-md bg-white">
        <div className="absolute right-0 top-0 h-0 w-0 border-l-[10px] border-t-[10px] border-l-transparent border-t-slate-300" />
        <div
          className={cn(
            "absolute bottom-1.5 left-1.5 right-1.5 rounded-sm",
            size === "small" ? "h-2.5" : "h-3",
            tone === "red" && "bg-rose-400",
            tone === "green" && "bg-teal-300",
            tone === "blue" && "bg-blue-300"
          )}
        />
      </div>
    </div>
  )
}