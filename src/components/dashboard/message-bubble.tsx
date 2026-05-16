import type { ReactNode } from "react"
import { motion } from "framer-motion"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import type { MessageSide } from "@/types/dashboard"

interface MessageBubbleProps {
  children: ReactNode
  side?: MessageSide
}

interface MarkdownMessageProps {
  content: string
}

function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-sky-100 underline decoration-white/40 underline-offset-4 hover:text-white"
          />
        ),
        code: ({ children, ...props }) => (
          <code
            {...props}
            className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[0.85em] text-sky-50"
          >
            {children}
          </code>
        ),
        li: ({ ...props }) => <li {...props} className="ml-4 list-disc" />,
        ol: ({ ...props }) => <ol {...props} className="my-2 space-y-1" />,
        p: ({ ...props }) => <p {...props} className="mb-2 last:mb-0" />,
        pre: ({ ...props }) => (
          <pre
            {...props}
            className="app-scrollbar my-2 overflow-x-auto rounded-lg bg-black/25 p-3 text-xs text-slate-100"
          />
        ),
        strong: ({ ...props }) => <strong {...props} className="font-extrabold text-white" />,
        ul: ({ ...props }) => <ul {...props} className="my-2 space-y-1" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export function MessageBubble({
  children,
  side = "left",
}: MessageBubbleProps) {
  const isRight = side === "right"
  const shouldRenderMarkdown = isRight && typeof children === "string"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, x: isRight ? 12 : -12 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "app-scrollbar relative mb-4 max-w-[85%] overflow-x-auto rounded-2xl px-4 py-3 text-sm font-medium leading-6 shadow-2xl md:max-w-[360px]",
        isRight
          ? "ml-auto bg-gradient-to-b from-blue-400 to-blue-700 text-white"
          : "ml-0 bg-gradient-to-b from-slate-500/80 to-slate-700/90 text-white md:ml-4"
      )}
    >
      {shouldRenderMarkdown ? <MarkdownMessage content={children} /> : children}
    </motion.div>
  )
}