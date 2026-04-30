"use client";

import { Bell, Moon, Search, Sun } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MobileSidebar } from "./mobile-sidebar";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/ui/use-toast";
import { useEffect, useState } from "react";

interface DashboardHeaderProps {
  title?: string;
}

function getUserInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "User";
  const words = source
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase())
    .filter(Boolean);

  return words.slice(0, 2).join("") || "U";
}

export function DashboardHeader({ title = "Overview" }: DashboardHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const userName = user?.name?.trim() || "CodeMap User";
  const userEmail = user?.email?.trim() || "Signed in";
  const userImage = user?.image || undefined;
  const userInitials = getUserInitials(user?.name, user?.email);

  const signOut = async () => {
    try {
      const response = await authClient.signOut();
      if (!response.error) {
        router.push("/auth");
        router.refresh();
        return;
      }

      toast({
        title: "Error signing out",
        description: response.error.message || "Unable to sign out right now.",
        variant: "destructive",
      });
    } catch (error) {
      toast({
        title: "Error signing out",
        description:
          "An error occurred while trying to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background px-4 lg:px-6">
      <MobileSidebar />

      <h1 className="text-lg font-semibold">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-64 bg-secondary border-border pl-8"
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={mounted ? (theme === "dark" ? "Switch to light" : "Switch to dark") : "Toggle theme"}
        >
          {mounted && theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-success" />
          <span className="sr-only">Notifications</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="size-8">
                <AvatarImage src={userImage} alt={userName} />
                <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <span className="sr-only">User menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {isPending ? "Loading..." : userName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isPending ? "Fetching session" : userEmail}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/projects">Projects</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
