"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { browserSettingsApi, type CreateUserApiKeyResponse } from "@/features/settings/api";
import { useToast } from "@/components/ui/use-toast";
import { createApiKeyBodySchema } from "@codemap/shared";

const api = browserSettingsApi();

export function CreateApiKeyDialog({
  trigger,
  onCreated,
}: {
  trigger: React.ReactNode;
  onCreated: () => Promise<unknown> | void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<"never" | "90_days">(
    "90_days",
  );
  const [createdKey, setCreatedKey] = useState<CreateUserApiKeyResponse | null>(
    null,
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  useEffect(() => {
    if (!open && !isPending) {
      setName("");
      setExpiryPreset("90_days");
      setCreatedKey(null);
      setNameError(null);
    }
  }, [isPending, open]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = createApiKeyBodySchema.safeParse({
      name,
      expiryPreset,
    });

    if (!parsed.success) {
      setNameError(parsed.error.flatten().fieldErrors.name?.[0] ?? null);
      return;
    }

    setNameError(null);

    startTransition(async () => {
      try {
        const result = await api.createApiKey(parsed.data);

        setCreatedKey(result);
        await onCreated();
        toast({
          title: "API key created",
          description: "Store the key now. It is only shown once.",
        });
      } catch (error) {
        toast({
          title: "Unable to create API key",
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
      }
    });
  }

  async function handleCopy(text: string, type: "key" | "env") {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "key") {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedEnv(true);
        setTimeout(() => setCopiedEnv(false), 2000);
      }
    } catch {
      toast({
        title: "Copy failed",
        description: "Copy the value manually from the field below.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>API key created</DialogTitle>
              <DialogDescription>
                This key is shown once. Copy it now and store it somewhere safe.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4" />
                  New key — copy now, shown once
                </div>

                {/* Plain key */}
                <div className="flex gap-2">
                  <Input value={createdKey.plainTextKey} readOnly className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(createdKey.plainTextKey, "key")}
                    title="Copy key"
                  >
                    {copiedKey ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                  </Button>
                </div>

                {/* Env snippet */}
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Environment variable snippet:
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={`CODEMAP_API_KEY=${createdKey.plainTextKey}`}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        handleCopy(`CODEMAP_API_KEY=${createdKey.plainTextKey}`, "env")
                      }
                      title="Copy env snippet"
                    >
                      {copiedEnv ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                Create a personal API key for scripts, MCP clients, or local
                integrations.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="api-key-name">Name</Label>
                <Input
                  id="api-key-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(null);
                  }}
                  placeholder="CodeMap MCP on Mac"
                  disabled={isPending}
                  required
                />
                {nameError ? (
                  <p className="text-sm text-destructive">{nameError}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key-expiry">Expiry</Label>
                <Select
                  value={expiryPreset}
                  onValueChange={(value: "never" | "90_days") =>
                    setExpiryPreset(value)
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id="api-key-expiry">
                    <SelectValue placeholder="Choose expiry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="90_days">90 days</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending || !name.trim()}>
                  {isPending ? "Creating..." : "Create key"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
