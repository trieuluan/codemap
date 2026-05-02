"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Book } from "lucide-react"
import { authClient } from "@/lib/auth-client"

export function WelcomeSection({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string
  workspaceName?: string | null
}) {
  const { data: session } = authClient.useSession()
  const userName = session?.user?.name?.split(" ")[0] ?? "there"

  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {userName}
        </h1>
        <p className="text-muted-foreground">
          {workspaceName
            ? `Here's what's happening in ${workspaceName}.`
            : "Here's what's happening in this workspace."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href="/docs">
            <Book className="mr-2 size-4" />
            Documentation
          </a>
        </Button>
        <Button size="sm" asChild>
          <Link href={`/w/${workspaceId}/projects`}>
            New Project
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
