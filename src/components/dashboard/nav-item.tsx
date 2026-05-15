import { NavLink } from "react-router-dom"
import { AppIcon } from "./icon"
import { cn } from "@/lib/utils"
import type { IconKey } from "@/types/dashboard"

interface NavItemProps {
  icon: IconKey
  label: string
  to?: string
  active?: boolean
  small?: boolean
  onClick?: () => void
}

function getClasses(active: boolean, small: boolean) {
  return cn(
    "mb-1 flex w-full items-center gap-3 rounded-xl border text-left transition-colors",
    small
      ? "border-transparent bg-transparent px-4 py-3 text-sm text-slate-300 hover:bg-white/5"
      : "px-4 py-3.5 text-sm font-semibold",
    active
      ? "border-blue-400/30 bg-gradient-to-b from-blue-500/25 to-indigo-950/70 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_rgba(0,0,0,0.25)]"
      : "border-transparent bg-white/[0.02] text-slate-100 hover:bg-white/[0.05]"
  )
}

export function NavItem({
  icon,
  label,
  to,
  active = false,
  small = false,
  onClick,
}: NavItemProps) {
  if (to) {
    return (
      <NavLink
        to={to}
        onClick={onClick}
        className={({ isActive }) => getClasses(isActive || active, small)}
      >
        <AppIcon name={icon} className="h-4 w-4 shrink-0 text-slate-200" />
        <span className="truncate">{label}</span>
      </NavLink>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={getClasses(active, small)}
    >
      <AppIcon name={icon} className="h-4 w-4 shrink-0 text-slate-200" />
      <span className="truncate">{label}</span>
    </button>
  )
}