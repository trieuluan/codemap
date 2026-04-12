"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Activity } from "lucide-react";

interface ActivityItem {
  id: string;
  type: "commit" | "deploy" | "invite" | "api";
  message: string;
  project?: string;
  timestamp: string;
}

// Empty state for new users
const activities: ActivityItem[] = [];

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
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Activity className="size-4 text-muted-foreground" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm">{activity.message}</p>
              {activity.project && (
                <p className="text-xs text-muted-foreground">
                  in {activity.project}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {activity.timestamp}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
