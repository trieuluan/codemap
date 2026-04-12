import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Upload, Code2, Zap } from "lucide-react"

const actions = [
  {
    id: "new-project",
    label: "New Project",
    icon: Plus,
    href: "/dashboard/projects/new",
  },
  {
    id: "import-repo",
    label: "Import Repo",
    icon: Upload,
    href: "/dashboard/projects/import",
  },
  {
    id: "api-docs",
    label: "API Docs",
    icon: Code2,
    href: "/dashboard/api/docs",
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Zap,
    href: "/dashboard/integrations",
  },
]

export function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant="secondary"
            className="h-auto flex-col gap-2 py-4"
            asChild
          >
            <a href={action.href}>
              <action.icon className="size-5" />
              <span className="text-xs">{action.label}</span>
            </a>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
