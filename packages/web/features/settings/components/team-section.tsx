"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Placeholder data — replace with real `useSWR("settings-team", …)` once the API exists.
const MEMBERS = [
  { initials: "JL", name: "John Le", email: "john@codemap.dev", role: "Owner" },
  { initials: "HP", name: "Huy Pham", email: "huy@codemap.dev", role: "Admin" },
  {
    initials: "TN",
    name: "Trinh Ngo",
    email: "trinh@codemap.dev",
    role: "Member",
  },
  {
    initials: "MD",
    name: "Minh Do",
    email: "minh@codemap.dev",
    role: "Member",
  },
];

export function TeamSection() {
  const [invite, setInvite] = useState("");

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Members</CardTitle>
          <CardDescription>
            People in your CodeMap workspace. Invite by email — they&apos;ll get
            a sign-in link.
          </CardDescription>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            type="email"
            placeholder="teammate@example.com"
            className="w-full sm:w-64"
          />
          <Button disabled={!invite}>Invite</Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {MEMBERS.map((m) => (
            <li
              key={m.email}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <Avatar className="size-9">
                <AvatarFallback>{m.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.email}
                </p>
              </div>
              <Badge variant={m.role === "Owner" ? "default" : "secondary"}>
                {m.role}
              </Badge>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Member options</span>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
