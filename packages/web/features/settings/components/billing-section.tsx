"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Placeholder data — replace with real billing API once it exists.
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="text-sm">{value}</div>
    </div>
  );
}

export function BillingSection() {
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Plan</CardTitle>
            <CardDescription>
              You&apos;re on the Pro plan, billed monthly.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm">
            Change plan
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Plan" value={<Badge>Pro</Badge>} />
            <Stat
              label="Seats"
              value={<span className="font-mono">4 / 10</span>}
            />
            <Stat
              label="Renews"
              value={<span className="font-mono">May 25, 2026</span>}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Payment method</CardTitle>
            <CardDescription>Charged on the 25th of each month.</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            Update
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-10 items-center justify-center rounded-md bg-secondary text-[10px] font-semibold tracking-wide">
              VISA
            </div>
            <div>
              <p className="font-mono text-sm">•••• 4242</p>
              <p className="text-xs text-muted-foreground">Expires 09/27</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            Past invoices. Receipts are emailed to the workspace owner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {[
              { id: "INV-2026-04", date: "Apr 25, 2026", amount: "$49.00" },
              { id: "INV-2026-03", date: "Mar 25, 2026", amount: "$49.00" },
              { id: "INV-2026-02", date: "Feb 25, 2026", amount: "$49.00" },
            ].map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between py-3 text-sm first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-muted-foreground">
                    {inv.id}
                  </span>
                  <span className="text-muted-foreground">{inv.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{inv.amount}</span>
                  <Button variant="ghost" size="sm">
                    Download
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
