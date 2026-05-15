import { useState } from "react"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { dashboardConfig } from "@/config/dashboard"
import { SidebarContent } from "./sidebar-content"
import { AppIcon } from "./icon"

export function MobileMenu() {
  const [open, setOpen] = useState(false)
  const { brand } = dashboardConfig

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-[86vw] max-w-[320px] border-r border-white/10 bg-[linear-gradient(180deg,rgba(21,32,87,.98),rgba(7,12,39,.98))] p-0 text-white"
      >
        <SheetHeader className="border-b border-white/10 px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-3 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-700">
              <AppIcon name={brand.icon} className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold">
              {brand.name}
              <span className="text-sky-400">{brand.accent}</span>
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="h-full overflow-y-auto">
          <SidebarContent showBrand={false} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}