"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet"
import {
  LayoutDashboard, FolderKanban, Code, Settings,
  HelpCircle, Menu, ShieldCheck, UserRound,
} from "lucide-react"
import { useAdminCheck } from "@/features/auth/use-admin-check"
import { useWorkspace } from "@/features/workspaces/workspace-context"

export function MobileSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { isAdmin } = useAdminCheck()
  const { activeWorkspace } = useWorkspace()
  const wid = activeWorkspace?.workspace.id ?? ""

  const navigation = wid ? [
    { name: "Overview", href: `/w/${wid}/dashboard`, icon: LayoutDashboard },
    { name: "Projects", href: `/w/${wid}/projects`, icon: FolderKanban },
    { name: "API", href: `/w/${wid}/api`, icon: Code },
    { name: "Settings", href: `/w/${wid}/settings/team`, icon: Settings },
  ] : []

  const secondaryNavigation = [
    { name: "Account", href: "/account/settings", icon: UserRound },
    { name: "Help", href: "/help", icon: HelpCircle },
  ]

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
        <SheetHeader className="flex h-14 items-center border-b border-sidebar-border px-4">
          <SheetTitle><Logo /></SheetTitle>
        </SheetHeader>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link key={item.name} href={item.href} onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.name}
                </Link>
              )
            })}
          </div>

          <div className="mt-8 space-y-1">
            {isAdmin && (
              <Link href="/admin" onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === "/admin" || pathname.startsWith("/admin/")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <ShieldCheck className="size-4" />
                Admin
              </Link>
            )}
            {secondaryNavigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link key={item.name} href={item.href} onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.name}
                </Link>
              )
            })}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
