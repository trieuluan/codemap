import { Card, CardContent } from "@/components/ui/card"
import { Activity, Bot, FolderKanban, GitBranch } from "lucide-react"
import type { WorkspaceUsageSummary } from "@/features/workspaces/api"

interface StatsSummaryProps {
  projectCount: number
  usage?: WorkspaceUsageSummary | null
  hasMcpConnection: boolean
}

export function StatsSummary({
  projectCount,
  usage,
  hasMcpConnection,
}: StatsSummaryProps) {
  const stats = [
    {
      id: "projects",
      label: "Projects",
      value: String(projectCount),
      icon: FolderKanban,
    },
    {
      id: "imports",
      label: "Imports this month",
      value: String(usage?.importsThisMonth ?? 0),
      icon: GitBranch,
    },
    {
      id: "indexed-files",
      label: "Indexed files",
      value: (usage?.indexedFilesThisMonth ?? 0).toLocaleString(),
      icon: Activity,
    },
    {
      id: "mcp",
      label: "MCP",
      value: hasMcpConnection ? "Connected" : "Not set up",
      icon: Bot,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.id}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-secondary/60 ring-1 ring-border">
              <stat.icon className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
