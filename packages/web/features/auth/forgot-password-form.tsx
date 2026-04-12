"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    // Placeholder for password reset API implementation
    // In production, this would call your auth API to send reset email
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setIsSubmitted(true);
    setIsLoading(false);
  }

  if (isSubmitted) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-success/10 p-4 text-center">
          <p className="text-sm font-medium text-foreground">
            Check your email
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            We&apos;ve sent a password reset link to <strong>{email}</strong>
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            The link will expire in 24 hours. If you don&apos;t see the email,
            check your spam folder.
          </p>
        </div>

        <Button
          onClick={() => {
            setIsSubmitted(false);
            setEmail("");
          }}
          variant="outline"
          className="w-full"
        >
          Try another email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          className="bg-secondary border-border"
        />
        <p className="text-xs text-muted-foreground">
          Enter the email associated with your account
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Spinner size="sm" />
            Sending reset link...
          </>
        ) : (
          "Send reset link"
        )}
      </Button>
    </form>
  );
}
