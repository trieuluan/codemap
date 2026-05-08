"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty, EmptyContent, EmptyDescription,
  EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty";

export default function ProjectDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return (
    <Empty className="border border-dashed border-border glass-card">
      <EmptyHeader>
        <EmptyMedia variant="icon"><AlertTriangle className="size-5" /></EmptyMedia>
        <EmptyTitle>Unable to load this project</EmptyTitle>
        <EmptyDescription>We could not load the project details right now.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="sm:flex-row sm:items-center sm:justify-center">
        <Button variant="outline" asChild>
          <Link href={`/w/${workspaceId}/projects`}>Back to projects</Link>
        </Button>
        <Button onClick={() => reset()}>Try again</Button>
      </EmptyContent>
    </Empty>
  );
}
