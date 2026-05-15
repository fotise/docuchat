import type { LucideIcon } from "lucide-react"
import {
  Briefcase,
  Compass,
  FileText,
  FolderKanban,
  Mail,
  Scale,
  Search,
  Shield,
} from "lucide-react"
import type { IconKey } from "@/types/dashboard"

const iconMap: Record<IconKey, LucideIcon> = {
  fileText: FileText,
  folderKanban: FolderKanban,
  scale: Scale,
  briefcase: Briefcase,
  mail: Mail,
  search: Search,
  shield: Shield,
  compass: Compass,
}

interface AppIconProps {
  name: IconKey
  className?: string
}

export function AppIcon({ name, className }: AppIconProps) {
  const IconComponent = iconMap[name]
  return <IconComponent className={className} />
}