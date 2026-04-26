"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Activity, GitBranch, KeyRound, UserPlus } from "lucide-react";

interface ActivityItem {
  id: string;
  type: "commit" | "deploy" | "invite" | "api" | "import";
  message: string;
  project?: string;
  timestamp: string;
}

// Demo data — replace with real API call when backend is ready
const activities: ActivityItem[] = [
  {
    id: "1",
    type: "import",
    message: "Import completed for codemap-web",
    project: "codemap-web",
    timestamp: "2 hours ago",
  },
  {
    id: "2",
    type: "api",
    message: "Created API key Production-MCP",
    project: "Account",
    timestamp: "yesterday",
  },
  {
    id: "3",
    type: "invite",
    message: "Invited huy@codemap.dev to the workspace",
    project: "Team",
    timestamp: "3 days ago",
  },
];

const iconByType: Record<ActivityItem["type"], React.ElementType> = {
  import: GitBranch,
  commit: GitBranch,
  deploy: Activity,
  api: KeyRound,
  invite: UserPlus,
};

export function RecentActivity() {
  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Empty
            icon={Activity}
            title="No activity yet"
            description="Your recent activity will appear here once you start using CodeMap."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.map((activity) => {
          const Icon = iconByType[activity.type] ?? Activity;
          return (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm">{activity.message}</p>
                <p className="text-xs text-muted-foreground">
                  {activity.project ? `in ${activity.project} · ` : ""}
                  {activity.timestamp}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
