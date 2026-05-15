import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { WorkspaceTab, WorkspaceTabId } from "@/types/dashboard"

interface ActiveChatsCardProps {
  title: string
  tabs: WorkspaceTab[]
  activeTab: WorkspaceTabId
}

export function ActiveChatsCard({
  title,
  tabs,
  activeTab,
}: ActiveChatsCardProps) {
  return (
    <Card className="rounded-[18px] border-white/10 bg-[linear-gradient(180deg,rgba(18,28,79,.92),rgba(12,20,58,.94))] text-white shadow-[0_10px_30px_rgba(0,0,0,.45)]">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-extrabold">
          {title}
        </CardTitle>
        <div className="text-xs text-slate-400">● ●</div>
      </CardHeader>

      <CardContent className="space-y-2">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab

          return (
            <motion.div
              key={tab.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={`h-3 w-3 shrink-0 rounded-sm ${tab.colorClass}`} />
                <span className="truncate text-sm font-semibold text-slate-100">
                  {tab.label}
                </span>
              </div>

              {isActive ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : null}
            </motion.div>
          )
        })}
      </CardContent>
    </Card>
  )
}