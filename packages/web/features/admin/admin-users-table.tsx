"use client";

import { Search } from "lucide-react";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import type { WorkspacePlan } from "@codemap-ai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  listAdminUsers,
  setUserRole,
  setWorkspacePlan,
  type AdminUser,
  type AdminUserListResponse,
} from "./api";

const PLAN_OPTIONS = ["basic", "beta", "developer", "team"] as const;

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
    basic: "bg-muted text-muted-foreground hover:bg-muted",
    beta: "",
  };
  return <Badge className={colors[plan]}>{plan}</Badge>;
}

type AdminUserWorkspace = AdminUser["workspaces"][number];

function WorkspacePlanControl({
  workspace,
  disabled,
  onUpdate,
}: {
  workspace: AdminUserWorkspace;
  disabled: boolean;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handlePlanChange(plan: string) {
    if (!PLAN_OPTIONS.includes(plan as WorkspacePlan)) return;
    startTransition(async () => {
      try {
        await setWorkspacePlan(workspace.id, plan as WorkspacePlan);
        toast({ title: `${workspace.name} plan updated to ${plan}` });
        onUpdate();
      } catch {
        toast({ title: "Failed to update plan", variant: "destructive" });
      }
    });
  }

  return (
    <Select
      value={workspace.plan}
      onValueChange={handlePlanChange}
      disabled={disabled || isPending}
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
  );
}

function UserRow({ user, onUpdate }: { user: AdminUser; onUpdate: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const isAdmin = user.systemRoles.includes("admin");

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
        {user.workspaces.length > 0 ? (
          <div className="space-y-3">
            {user.workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="flex min-w-72 items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-medium">
                      {workspace.name}
                    </p>
                    <PlanBadge plan={workspace.plan} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {workspace.role}
                  </p>
                </div>
                {workspace.role === "owner" ? (
                  <WorkspacePlanControl
                    workspace={workspace}
                    disabled={isPending}
                    onUpdate={onUpdate}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    read-only
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
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
  initialResponse,
}: {
  initialResponse: AdminUserListResponse;
}) {
  const [response, setResponse] = useState(initialResponse);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [isLoading, startTransition] = useTransition();

  const users = response.items;
  const { page, pageSize, total, totalPages } = response.pagination;

  function loadUsers(nextPage: number, nextQuery = submittedQuery) {
    startTransition(async () => {
      try {
        const fresh = await listAdminUsers({
          page: nextPage,
          pageSize,
          q: nextQuery || undefined,
        });
        setResponse(fresh);
        setSubmittedQuery(nextQuery);
      } catch {
        // stale data is acceptable for this admin utility surface
      }
    });
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadUsers(1, query.trim());
  }

  return (
    <div className="rounded-lg border border-border/70 glass-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium">Users</p>
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString()} total · page {page} of {totalPages}
          </p>
        </div>
        <form className="flex w-full gap-2 lg:w-80" onSubmit={handleSearch}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users..."
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline" disabled={isLoading}>
            Search
          </Button>
        </form>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">User</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">System role</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Workspaces</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} onUpdate={() => loadUsers(page)} />
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Showing {users.length.toLocaleString()} of {total.toLocaleString()}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || page <= 1}
            onClick={() => loadUsers(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || page >= totalPages}
            onClick={() => loadUsers(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
