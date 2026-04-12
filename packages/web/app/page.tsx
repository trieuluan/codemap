import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ArrowRight, GitBranch, Code, BarChart3, Users } from "lucide-react";

const features = [
  {
    icon: GitBranch,
    title: "Project Mapping",
    description: "Visualize your entire codebase structure at a glance",
  },
  {
    icon: Code,
    title: "API Analysis",
    description: "Automatically detect and document your APIs",
  },
  {
    icon: BarChart3,
    title: "Code Insights",
    description: "Get actionable insights about code quality and complexity",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Share knowledge and work together effectively",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth">
                Get Started
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-20 text-center lg:py-32">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance lg:text-6xl">
            Map and understand your codebase
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground text-balance">
            CodeMap helps teams visualize, analyze, and document their code. Get
            instant insights into your project structure and architecture.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/auth">
                Start for free
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/docs">View documentation</Link>
            </Button>
          </div>
        </section>

        {/* Features Grid */}
        <section className="border-t border-border bg-card/50">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="flex flex-col items-start space-y-3"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                    <feature.icon className="size-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center">
            <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">
              Ready to map your code?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Join thousands of developers who use CodeMap to understand and
              improve their codebases.
            </p>
            <Button size="lg" className="mt-8" asChild>
              <Link href="/auth">
                Get started free
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
          <Logo showText={false} />
          <p className="text-sm text-muted-foreground">
            Built by the CodeMap team
          </p>
        </div>
      </footer>
    </div>
  );
}
