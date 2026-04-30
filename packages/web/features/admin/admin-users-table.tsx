"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { setUserRole, setWorkspacePlan, type AdminUser } from "./api";

const PLAN_OPTIONS = ["beta", "developer", "team"] as const;

function RoleBadge({ roles }: { roles: string[] }) {
  if (roles.includes("admin")) {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">admin</Badge>;
  }
  return <Badge variant="secondary">user</Badge>;
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    team: "bg-primary text-primary-foreground hover:bg-primary",
    developer: "bg-emerald-600 text-white hover:bg-emerald-600",
    beta: "",
  };
  return <Badge className={colors[plan]}>{plan}</Badge>;
}

function UserRow({ user, onUpdate }: { user: AdminUser; onUpdate: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const isAdmin = user.systemRoles.includes("admin");
  const primaryWorkspace = user.workspaces[0];

  function handleRoleToggle() {
    startTransition(async () => {
      try {
        await setUserRole(user.id, isAdmin ? "user" : "admin");
        toast({ title: `Role updated to ${isAdmin ? "user" : "admin"}` });
        onUpdate();
      } catch {
        toast({ title: "Failed to update role", variant: "destructive" });
      }
    });
  }

  function handlePlanChange(plan: string) {
    if (!primaryWorkspace) return;
    startTransition(async () => {
      try {
        await setWorkspacePlan(primaryWorkspace.id, plan);
        toast({ title: `Plan updated to ${plan}` });
        onUpdate();
      } catch {
        toast({ title: "Failed to update plan", variant: "destructive" });
      }
    });
  }

  return (
    <tr className="border-b border-border/70 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium">{user.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <RoleBadge roles={user.systemRoles} />
      </td>
      <td className="px-4 py-3">
        {primaryWorkspace ? (
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{primaryWorkspace.name}</p>
            <PlanBadge plan={primaryWorkspace.plan} />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {primaryWorkspace ? (
          <Select
            value={primaryWorkspace.plan}
            onValueChange={handlePlanChange}
            disabled={isPending}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_OPTIONS.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <Button
          variant={isAdmin ? "destructive" : "outline"}
          size="sm"
          className="h-7 text-xs"
          disabled={isPending}
          onClick={handleRoleToggle}
        >
          {isAdmin ? "Remove admin" : "Make admin"}
        </Button>
      </td>
    </tr>
  );
}

export function AdminUsersTable({
  initialUsers,
}: {
  initialUsers: AdminUser[];
}) {
  const [users, setUsers] = useState(initialUsers);

  async function reload() {
    try {
      const { listAdminUsers } = await import("./api");
      const fresh = await listAdminUsers();
      setUsers(fresh);
    } catch {
      // silently ignore — stale data ok
    }
  }

  return (
    <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <p className="text-sm font-medium">Users</p>
        <span className="text-xs text-muted-foreground">{users.length} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">User</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">System role</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Workspace</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Set plan</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} onUpdate={reload} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
