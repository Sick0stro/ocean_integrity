import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface DocumentTypeCardProps {
  title: string
  description: string
  icon: LucideIcon
  color: "blue" | "green" | "amber" | "purple" | "slate"
}

export default function DocumentTypeCard({ title, description, icon: Icon, color }: DocumentTypeCardProps) {
  const colorMap = {
    blue: {
      bg: "bg-blue-100",
      text: "text-blue-600",
      border: "border-blue-200",
    },
    green: {
      bg: "bg-green-100",
      text: "text-green-600",
      border: "border-green-200",
    },
    amber: {
      bg: "bg-amber-100",
      text: "text-amber-600",
      border: "border-amber-200",
    },
    purple: {
      bg: "bg-purple-100",
      text: "text-purple-600",
      border: "border-purple-200",
    },
    slate: {
      bg: "bg-slate-100",
      text: "text-slate-600",
      border: "border-slate-200",
    },
  }

  const { bg, text, border } = colorMap[color]

  return (
    <Card className={`border ${border} hover:shadow-md transition-shadow`}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 ${bg} rounded-md mt-1`}>
          <Icon className={`h-5 w-5 ${text}`} />
        </div>
        <div>
          <h3 className="font-medium text-slate-800">{title}</h3>
          <p className="text-xs text-slate-600 mt-1">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}
