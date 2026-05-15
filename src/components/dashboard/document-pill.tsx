import { motion } from "framer-motion"
import type { HighlightedFile } from "@/types/dashboard"
import { FilePreviewIcon } from "./file-preview-icon"

type DocumentPillProps = HighlightedFile

export function DocumentPill({ name, tone }: DocumentPillProps) {
  return (
    <motion.div
      key={name}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-4 ml-0 inline-flex max-w-full items-center gap-3 rounded-xl bg-white/10 px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,.45)] md:ml-10"
    >
      <FilePreviewIcon tone={tone} size="small" />
      <span className="truncate text-sm text-slate-100">{name}</span>
    </motion.div>
  )
}