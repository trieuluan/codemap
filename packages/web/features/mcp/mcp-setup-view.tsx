"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  KeyRound,
  MonitorCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateApiKeyDialog } from "@/features/settings/components/create-api-key-dialog";
import { browserSettingsApi } from "@/features/settings/api";

const api = browserSettingsApi();

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

  const activeKeys =
    apiKeys?.filter(
      (k) =>
        k.enabled &&
        !(k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now()),
    ) ?? [];

  const mcpKeys = activeKeys.filter((k) => k.metadata?.client === "mcp");
  const isConnected = mcpKeys.length > 0;

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
          Connect CodeMap to your AI tool in two steps. Authentication is fully
          automatic — no API key copy-paste needed.
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
            Add the config below to your AI tool. No API key needed here —
            authentication happens automatically in step 2.
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

        {/* Step 3: Use */}
        <Step number={3} title="Start exploring" done={isConnected}>
          <p className="text-sm text-muted-foreground">
            Once connected, CodeMap gives your AI tool full visibility into your
            codebase. Try:
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { q: "What files handle authentication?", desc: "Codebase search" },
              { q: "Show me the dependency graph", desc: "Graph & insights" },
              { q: "Where is UserService defined?", desc: "Symbol lookup" },
              { q: "Suggest where to add this feature", desc: "Edit locations" },
            ].map(({ q, desc }) => (
              <div
                key={q}
                className="rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 space-y-0.5"
              >
                <p className="font-mono text-xs">"{q}"</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
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
