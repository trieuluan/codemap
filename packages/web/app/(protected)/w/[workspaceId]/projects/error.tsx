"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function ProjectsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Empty className="border border-dashed border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertTriangle className="size-5" />
        </EmptyMedia>
        <EmptyTitle>Unable to load projects</EmptyTitle>
        <EmptyDescription>
          Something went wrong while loading your project workspace.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => reset()}>Try again</Button>
      </EmptyContent>
    </Empty>
  );
}
