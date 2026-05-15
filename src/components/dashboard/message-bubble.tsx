import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { MessageSide } from "@/types/dashboard"

interface MessageBubbleProps {
  children: ReactNode
  side?: MessageSide
}

export function MessageBubble({
  children,
  side = "left",
}: MessageBubbleProps) {
  const isRight = side === "right"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, x: isRight ? 12 : -12 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "relative mb-4 max-w-[85%] rounded-2xl px-4 py-3 text-sm font-medium leading-6 shadow-2xl md:max-w-[360px]",
        isRight
          ? "ml-auto bg-gradient-to-b from-blue-400 to-blue-700 text-white"
          : "ml-0 bg-gradient-to-b from-slate-500/80 to-slate-700/90 text-white md:ml-4"
      )}
    >
      {children}
    </motion.div>
  )
}