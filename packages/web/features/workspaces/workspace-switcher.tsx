"use client";

import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, isLoading, switchWorkspace } = useWorkspace();

  // Only show switcher if user has multiple workspaces
  if (isLoading || workspaces.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 text-sm font-medium max-w-[180px]"
        >
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{activeWorkspace?.workspace.name ?? "Select workspace"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map(({ workspace, membership }) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => switchWorkspace(workspace.id)}
            className="gap-2"
          >
            <Check
              className={cn(
                "size-4 shrink-0",
                activeWorkspace?.workspace.id === workspace.id
                  ? "opacity-100"
                  : "opacity-0",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{workspace.name}</p>
              <p className="truncate text-xs text-muted-foreground capitalize">
                {membership.role}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
