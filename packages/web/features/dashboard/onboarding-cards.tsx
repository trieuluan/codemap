"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  GitBranch,
  Settings,
  Users,
  Compass,
  Check,
  ArrowRight,
} from "lucide-react"

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: React.ElementType
  completed: boolean
  href: string
}

const steps: OnboardingStep[] = [
  {
    id: "connect-project",
    title: "Connect a project",
    description: "Import your first repository to get started",
    icon: GitBranch,
    completed: false,
    href: "/dashboard/projects/new",
  },
  {
    id: "configure-api",
    title: "Configure API",
    description: "Set up your API keys and endpoints",
    icon: Settings,
    completed: false,
    href: "/dashboard/api",
  },
  {
    id: "invite-team",
    title: "Invite your team",
    description: "Collaborate with your team members",
    icon: Users,
    completed: false,
    href: "/dashboard/team",
  },
  {
    id: "explore-dashboard",
    title: "Explore the dashboard",
    description: "Discover features and capabilities",
    icon: Compass,
    completed: false,
    href: "/dashboard",
  },
]

export function OnboardingCards() {
  const completedCount = steps.filter((step) => step.completed).length
  const progressPercent = (completedCount / steps.length) * 100

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Getting started</h2>
          <p className="text-sm text-muted-foreground">
            Complete these steps to set up your workspace
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {completedCount} of {steps.length} complete
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
              step.completed && "border-success/30 bg-success/5"
            )}
          >
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg bg-secondary",
                    step.completed && "bg-success/20"
                  )}
                >
                  {step.completed ? (
                    <Check className="size-5 text-success" />
                  ) : (
                    <step.icon className="size-5 text-muted-foreground" />
                  )}
                </div>
                {!step.completed && (
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </div>

              <div className="space-y-1.5">
                <h3 className="font-medium leading-none">{step.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {step.description}
                </p>
              </div>

              {!step.completed && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  asChild
                >
                  <a href={step.href}>Get started</a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
