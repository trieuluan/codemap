"use client";

import Link from "next/link";
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

export default function ProjectDetailError({
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
        <EmptyTitle>Unable to load this project</EmptyTitle>
        <EmptyDescription>
          We could not load the project details right now.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="sm:flex-row sm:items-center sm:justify-center">
        <Button variant="outline" asChild>
          <Link href="/projects">Back to projects</Link>
        </Button>
        <Button onClick={() => reset()}>Try again</Button>
      </EmptyContent>
    </Empty>
  );
}
