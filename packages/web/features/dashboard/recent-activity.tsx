"use client";

import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, GitBranch } from "lucide-react";
import { browserProjectsApi, type ProjectListItem } from "@/features/projects/api";

function useRecentActivity() {
  return useSWR("dashboard-activity", () =>
    browserProjectsApi.getProjects({ include: ["latestImport"] }),
  );
}

function buildActivities(projects: ProjectListItem[]) {
  return projects
    .filter((p): p is ProjectListItem & { latestImport: NonNullable<ProjectListItem["latestImport"]> } =>
      p.latestImport != null,
    )
    .map((p) => {
      const imp = p.latestImport;
      const completedAt = imp.completedAt ? new Date(imp.completedAt) : null;
      const timestamp = completedAt
        ? formatDistanceToNow(completedAt, { addSuffix: true })
        : "recently";
      const statusLabel =
        imp.status === "completed" ? "completed"
        : imp.status === "failed" ? "failed"
        : "in progress";
      return {
        id: imp.id,
        message: `Import ${statusLabel} for ${p.name}`,
        project: p.name,
        timestamp,
        sortKey: imp.completedAt ?? imp.startedAt ?? "",
      };
    })
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .slice(0, 10);
}

export function RecentActivity() {
  const { data: projects, isLoading } = useRecentActivity();
  const activities = projects ? buildActivities(projects) : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="mt-0.5 size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <Empty
            icon={Activity}
            title="No activity yet"
            description="Your recent activity will appear here once you start using CodeMap."
          />
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <GitBranch className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm">{activity.message}</p>
                  <p className="text-xs text-muted-foreground">
                    in {activity.project} · {activity.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
