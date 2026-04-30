"use client";

import Link from "next/link";
import { ArrowRight, Bot, Check, GitBranch, Github, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface OnboardingCardsProps {
  hasProjects: boolean;
  hasMcpConnection: boolean;
  firstProjectId?: string;
}

export function OnboardingCards({
  hasProjects,
  hasMcpConnection,
  firstProjectId,
}: OnboardingCardsProps) {
  const steps = [
    {
      id: "connect-project",
      title: "Create or link project",
      description: "Import a repository so CodeMap can build the first index.",
      icon: GitBranch,
      completed: hasProjects,
      href: "/projects",
      cta: hasProjects ? "Projects ready" : "Create project",
    },
    {
      id: "setup-mcp",
      title: "Set up MCP",
      description: "Connect CodeMap to your AI tool for search and edit context.",
      icon: Bot,
      completed: hasMcpConnection,
      href: "/dashboard/api",
      cta: hasMcpConnection ? "MCP connected" : "Set up MCP",
    },
    {
      id: "connect-provider",
      title: "Connect GitHub/GitLab",
      description: "Optional, useful for importing private repositories.",
      icon: Github,
      completed: false,
      href: "#repository-providers",
      cta: "Connect provider",
      optional: true,
    },
    {
      id: "open-first-map",
      title: "Open first map",
      description: "Explore files, graph, insights, and history once indexed.",
      icon: Network,
      completed: hasProjects,
      href: firstProjectId ? `/projects/${firstProjectId}/explorer` : "/projects",
      cta: hasProjects ? "Open Explorer" : "Waiting for project",
      disabled: !hasProjects,
    },
  ];

  const requiredSteps = steps.filter((step) => !step.optional);
  const completedCount = requiredSteps.filter((step) => step.completed).length;
  const progressPercent = (completedCount / requiredSteps.length) * 100;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Getting started</h2>
          <p className="text-sm text-muted-foreground">
            Complete the essentials, then connect providers when private repo
            access is needed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {completedCount} of {requiredSteps.length} required
          </span>
          <Progress value={progressPercent} className="w-24" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <Card
            key={step.id}
            className={cn(
              "group relative overflow-hidden transition-colors hover:border-muted-foreground/30",
              step.completed && "border-success/30 bg-success/5",
              step.disabled && "opacity-75",
            )}
          >
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg bg-secondary",
                    step.completed && "bg-success/20",
                  )}
                >
                  {step.completed ? (
                    <Check className="size-5 text-success" />
                  ) : (
                    <step.icon className="size-5 text-muted-foreground" />
                  )}
                </div>
                {step.optional ? (
                  <Badge variant="outline" className="text-xs">
                    Optional
                  </Badge>
                ) : !step.completed ? (
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                ) : null}
              </div>

              <div className="min-h-20 space-y-1.5">
                <h3 className="font-medium leading-none">{step.title}</h3>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>

              {!step.completed || step.id === "open-first-map" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-auto w-full"
                  asChild={!step.disabled}
                  disabled={step.disabled}
                >
                  {step.disabled ? (
                    <span>{step.cta}</span>
                  ) : (
                    <Link href={step.href}>{step.cta}</Link>
                  )}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
