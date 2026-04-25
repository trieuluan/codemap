"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Visibility = "private" | "internal" | "public";

const VISIBILITY: { value: Visibility; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "internal", label: "Internal" },
  { value: "public", label: "Public" },
];

function FormRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 border-b border-border py-4 last:border-0 sm:grid-cols-[240px_1fr] sm:gap-6 sm:py-5">
      <div className="space-y-1">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function AccountSection() {
  // Local-only state — wire up to a real mutate when the API exists.
  const [name, setName] = useState("John Le");
  const email = "john@codemap.dev";
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [emailNotif, setEmailNotif] = useState(true);
  const [importNotif, setImportNotif] = useState(true);
  const [productEmails, setProductEmails] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const confirmPhrase = "delete my account";

  return (
    <>
      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your name and email as shown to teammates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 border-b border-border pb-4">
            <Avatar className="size-14">
              <AvatarFallback className="text-base">JL</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">Avatar</p>
              <p className="text-xs text-muted-foreground">
                Defaults to your initials. Upload a PNG or JPG up to 1MB.
              </p>
            </div>
            <Button variant="outline" size="sm">
              Upload
            </Button>
            <Button variant="ghost" size="sm">
              Remove
            </Button>
          </div>

          <FormRow
            label="Name"
            hint="Used in mentions and audit logs."
            htmlFor="account-name"
          >
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-sm"
            />
          </FormRow>

          <FormRow
            label="Email"
            hint="Used to sign in. Contact support to change."
            htmlFor="account-email"
          >
            <div className="flex items-center gap-3">
              <Input
                id="account-email"
                value={email}
                disabled
                className="max-w-sm opacity-70"
              />
              <Badge
                variant="outline"
                className="border-success/40 text-success"
              >
                <CheckCircle2 className="mr-1 size-3" />
                Verified
              </Badge>
            </div>
          </FormRow>

          <FormRow
            label="Default project visibility"
            hint="Applied to new projects unless overridden."
          >
            <div className="flex flex-wrap gap-2">
              {VISIBILITY.map((v) => (
                <Button
                  key={v.value}
                  type="button"
                  size="sm"
                  variant={visibility === v.value ? "secondary" : "outline"}
                  onClick={() => setVisibility(v.value)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </FormRow>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
            <Button size="sm">Save changes</Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Choose which emails CodeMap sends you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormRow
            label="Account email"
            hint="Sign-in alerts and security notices. Cannot be turned off."
          >
            <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
          </FormRow>
          <FormRow
            label="Import results"
            hint="Notify me when an import completes or fails."
          >
            <Switch checked={importNotif} onCheckedChange={setImportNotif} />
          </FormRow>
          <FormRow
            label="Product updates"
            hint="Occasional emails about new CodeMap features."
          >
            <Switch
              checked={productEmails}
              onCheckedChange={setProductEmails}
            />
          </FormRow>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Irreversible actions. Be sure before continuing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormRow
            label="Transfer ownership"
            hint="Move all projects and API keys to another team member."
          >
            <Button variant="outline" size="sm">
              Transfer…
            </Button>
          </FormRow>
          <FormRow
            label="Delete account"
            hint="Permanently delete your CodeMap account, all projects, snapshots, and API keys. This cannot be undone."
          >
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              Delete account
            </Button>
          </FormRow>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account, all projects, all
              snapshots, and revokes every API key. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="confirm-delete" className="text-sm">
              Type{" "}
              <span className="font-mono text-destructive">
                {confirmPhrase}
              </span>{" "}
              to confirm.
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmPhrase}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== confirmPhrase}
              className={cn(
                "bg-destructive text-white hover:bg-destructive/90",
                confirmText !== confirmPhrase && "pointer-events-none opacity-50",
              )}
              onClick={() => setConfirmOpen(false)}
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
