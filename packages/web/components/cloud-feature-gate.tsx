import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CloudFeatureGate({
  feature,
  projectUrl,
  upgradeUrl,
}: {
  feature: string;
  projectUrl: string;
  upgradeUrl: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <LockKeyhole className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium">{feature} requires cloud indexing</p>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Basic workspaces use the local MCP index only. Upgrade to Developer
              or Team to enable cloud imports, graph views, and insights.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" asChild>
            <Link href={projectUrl}>
              <ArrowLeft className="size-4" />
              Back to project
            </Link>
          </Button>
          <Button asChild>
            <Link href={upgradeUrl}>Upgrade</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
