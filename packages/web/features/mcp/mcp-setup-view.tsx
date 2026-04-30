"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  GitBranch,
  KeyRound,
  MonitorCheck,
  Network,
  RefreshCcw,
  Sparkles,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateApiKeyDialog } from "@/features/settings/components/create-api-key-dialog";
import { browserSettingsApi } from "@/features/settings/api";
import { browserProjectsApi } from "@/features/projects/api";

const api = browserSettingsApi();
const projectsApi = browserProjectsApi;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-4 py-3 font-mono text-sm">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre">{code}</pre>
      <CopyButton text={code} />
    </div>
  );
}

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            done
              ? "bg-emerald-500 text-white"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {done ? <Check className="size-4" /> : number}
        </div>
        <div className="mt-2 flex-1 border-l border-border/60" />
      </div>
      <div className="min-w-0 flex-1 pb-8 space-y-3">
        <p className="font-medium leading-7">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function McpSetupView({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { data: apiKeys, mutate } = useSWR("settings-api-keys", () =>
    api.listApiKeys(),
  );
  const { data: projects } = useSWR("mcp-setup-projects", () =>
    projectsApi.getProjects({ include: ["latestImport"] }),
  );

  const activeKeys =
    apiKeys?.filter(
      (k) =>
        k.enabled &&
        !(k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now()),
    ) ?? [];

  const mcpKeys = activeKeys.filter((k) => k.metadata?.client === "mcp");
  const isConnected = mcpKeys.length > 0;
  const hasProjects = (projects?.length ?? 0) > 0;
  const readyProject = projects?.find(
    (project) =>
      project.status === "ready" &&
      project.latestImport?.status === "completed" &&
      project.latestImport.parseStatus === "completed",
  );
  const activeImportProject = projects?.find(
    (project) =>
      project.status === "importing" ||
      project.latestImport?.status === "pending" ||
      project.latestImport?.status === "queued" ||
      project.latestImport?.status === "running" ||
      project.latestImport?.parseStatus === "queued" ||
      project.latestImport?.parseStatus === "running",
  );
  const hasReadyProject = Boolean(readyProject);

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        codemap: {
          command: "npx",
          args: ["-y", "@codemap/mcp-server@latest"],
        },
      },
    },
    null,
    2,
  );

  const vscodeConfig = JSON.stringify(
    {
      "mcp.servers": {
        codemap: {
          command: "npx",
          args: ["-y", "@codemap/mcp-server@latest"],
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">API & MCP</h1>
        <p className="text-sm text-muted-foreground">
          Connect CodeMap to your AI tool, link a project, and wait for the
          index before asking for codebase context.
        </p>
        <p className="text-xs text-muted-foreground">
          API endpoint: <span className="font-mono text-foreground">{apiBaseUrl}</span>
        </p>
      </div>

      {/* Connection status banner */}
      {isConnected ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <MonitorCheck className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              CodeMap MCP is connected
            </p>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
              {mcpKeys.length} MCP session{mcpKeys.length === 1 ? "" : "s"} active
              {mcpKeys[0]?.metadata?.deviceName
                ? ` · ${mcpKeys[0].metadata.deviceName}`
                : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/settings/api-keys">
              Manage keys
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <Sparkles className="size-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Follow the two steps below. Once connected, your AI tool can explore
            code, read files, search symbols, and trigger re-imports directly.
          </p>
        </div>
      )}

      {/* Steps */}
      <div>
        {/* Step 1: Add to AI tool */}
        <Step number={1} title="Add CodeMap to your AI tool" done={isConnected}>
          <p className="text-sm text-muted-foreground">
            Add the config below to your AI tool. No API key is needed here —
            authentication happens from the AI tool in the next step.
          </p>

          <Tabs defaultValue="claude">
            <TabsList>
              <TabsTrigger value="claude">Claude Desktop</TabsTrigger>
              <TabsTrigger value="vscode">VS Code</TabsTrigger>
            </TabsList>

            <TabsContent value="claude" className="space-y-2 mt-3">
              <p className="text-xs text-muted-foreground">
                Open{" "}
                <span className="font-medium text-foreground">
                  Claude → Settings → Developer → Edit Config
                </span>{" "}
                and paste:
              </p>
              <CodeBlock code={claudeDesktopConfig} />
              <p className="text-xs text-muted-foreground">
                Restart Claude Desktop after saving.
              </p>
            </TabsContent>

            <TabsContent value="vscode" className="space-y-2 mt-3">
              <p className="text-xs text-muted-foreground">
                Add to your VS Code{" "}
                <span className="font-medium text-foreground">settings.json</span> (or use the MCP panel):
              </p>
              <CodeBlock code={vscodeConfig} />
            </TabsContent>
          </Tabs>

          <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            <Terminal className="size-3.5 shrink-0 mt-0.5" />
            <span>
              The MCP server runs via <code className="font-mono">npx @codemap/mcp-server@latest</code> — no global install required. Node.js 18+ needed.
            </span>
          </div>
        </Step>

        {/* Step 2: Sign in via AI tool */}
        <Step number={2} title="Sign in from your AI tool" done={isConnected}>
          <p className="text-sm text-muted-foreground">
            After adding the config, ask your AI tool to connect CodeMap:
          </p>

          <div className="space-y-2">
            {[
              "Connect CodeMap",
              "Check CodeMap auth status",
              "Set up CodeMap for this project",
            ].map((prompt) => (
              <div
                key={prompt}
                className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2"
              >
                <span className="flex-1 font-mono text-xs">"{prompt}"</span>
                <CopyButton text={prompt} />
              </div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            The AI will call{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">start_auth_flow</code>,
            open a browser tab on this site, and you approve access with one
            click. After that, the API key is saved automatically — nothing to
            copy.
          </p>

          {!isConnected ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ArrowRight className="size-3.5 shrink-0" />
              Connected MCP sessions will appear here once authorized.
            </div>
          ) : (
            <div className="space-y-1.5">
              {mcpKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2"
                >
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">
                      {key.metadata?.clientName ?? key.name ?? "MCP session"}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {key.start ? `${key.start}••••••••` : "••••••••••••"}
                    </p>
                  </div>
                  {key.metadata?.deviceName ? (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {key.metadata.deviceName}
                    </span>
                  ) : null}
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs shrink-0">
                    Active
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Step>

        {/* Step 3: Link project */}
        <Step number={3} title="Create or link the current project" done={hasProjects}>
          <p className="text-sm text-muted-foreground">
            Project setup happens in your AI tool. From your repository
            workspace, ask it to create or link the CodeMap project:
          </p>

          <div className="space-y-2">
            {[
              "Set up CodeMap for this project",
              "Create a CodeMap project for this workspace",
              "Get current CodeMap project",
            ].map((prompt) => (
              <div
                key={prompt}
                className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2"
              >
                <span className="flex-1 font-mono text-xs">"{prompt}"</span>
                <CopyButton text={prompt} />
              </div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            The AI should call{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">get_project</code>{" "}
            first. If no project is linked, it should call{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">create_project</code>.
          </p>

          {hasProjects ? (
            <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
              <GitBranch className="size-3.5 shrink-0" />
              {projects?.length} project{projects?.length === 1 ? "" : "s"} available.
            </div>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href="/projects">
                Create from web instead
                <ChevronRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </Step>

        {/* Step 4: Import */}
        <Step number={4} title="Wait for import and parse" done={hasReadyProject}>
          <p className="text-sm text-muted-foreground">
            Once the project is linked, the AI should wait until the index is
            ready before relying on search, symbols, callers, or edit-location
            suggestions.
          </p>

          <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            <RefreshCcw className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Expected MCP flow:{" "}
              <code className="font-mono">trigger_reimport</code> when needed,
              then <code className="font-mono">wait_for_import</code> until
              completed.
            </span>
          </div>

          {hasReadyProject ? (
            <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
              <CheckCircle2 className="size-3.5 shrink-0" />
              At least one project has a completed semantic index.
            </div>
          ) : activeImportProject ? (
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <RefreshCcw className="size-3.5 shrink-0 animate-spin" />
              Import or parse is currently in progress.
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No ready indexed project detected yet.
            </p>
          )}
        </Step>

        {/* Step 5: Use */}
        <Step number={5} title="Try the first MCP command" done={isConnected && hasReadyProject}>
          <p className="text-sm text-muted-foreground">
            When auth and indexing are ready, ask your AI tool to use CodeMap
            before opening large files manually.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { q: "Get the current CodeMap project", desc: "Project health" },
              { q: "Search CodeMap for authentication", desc: "Codebase search" },
              { q: "Suggest edit locations for this task", desc: "Edit locations" },
              { q: "Find callers for this function", desc: "Symbol callers" },
            ].map(({ q, desc }) => (
              <div
                key={q}
                className="space-y-0.5 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 font-mono text-xs">"{q}"</p>
                  <CopyButton text={q} />
                </div>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {readyProject ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${readyProject.id}/explorer`}>
                Open ready project in Explorer
                <Network className="size-3.5" />
              </Link>
            </Button>
          ) : null}
        </Step>
      </div>

      {/* Manual / advanced */}
      <div className="rounded-lg border border-border/70 bg-muted/20 p-5 space-y-3">
        <p className="text-sm font-medium">Manual API key (advanced)</p>
        <p className="text-xs text-muted-foreground">
          If you need to authenticate without a browser — e.g. in a CI
          environment or headless server — create a manual API key and set{" "}
          <code className="rounded bg-muted px-1 font-mono">CODEMAP_API_KEY</code> in
          the MCP server environment.
        </p>
        <div className="flex flex-wrap gap-2">
          <CreateApiKeyDialog
            onCreated={() => void mutate()}
            trigger={
              <Button variant="outline" size="sm">
                <KeyRound className="size-3.5" />
                Create manual API key
              </Button>
            }
          />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/settings/api-keys">
              View all keys
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
