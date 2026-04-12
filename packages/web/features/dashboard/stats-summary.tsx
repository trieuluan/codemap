import { Card, CardContent } from "@/components/ui/card"
import { FolderKanban, Code, Users, Activity } from "lucide-react"

const stats = [
  {
    id: "projects",
    label: "Projects",
    value: "0",
    icon: FolderKanban,
    change: null,
  },
  {
    id: "api-calls",
    label: "API Calls",
    value: "0",
    icon: Code,
    change: null,
  },
  {
    id: "team-members",
    label: "Team Members",
    value: "1",
    icon: Users,
    change: null,
  },
  {
    id: "uptime",
    label: "Uptime",
    value: "100%",
    icon: Activity,
    change: null,
  },
]

export function StatsSummary() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.id}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
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
