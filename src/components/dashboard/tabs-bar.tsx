import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { WorkspaceTab, WorkspaceTabId } from "@/types/dashboard"

interface TabsBarProps {
  tabs: WorkspaceTab[]
  value: WorkspaceTabId
  onValueChange: (value: string) => void
}

export function TabsBar({
  tabs,
  value,
  onValueChange,
}: TabsBarProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="w-full">
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="rounded-xl px-4 py-2.5 text-xs font-bold transition data-[state=active]:border data-[state=active]:border-blue-400/30 data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500/25 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=inactive]:border data-[state=inactive]:border-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-300"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}