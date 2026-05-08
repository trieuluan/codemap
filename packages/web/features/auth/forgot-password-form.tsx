"use client";

import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSubmitted(true);
    setIsLoading(false);
  }

  if (isSubmitted) {
    return (
      <div className="space-y-4">
        <div className="glass-card p-6 text-center space-y-3">
          <div className="flex justify-center">
            <div className="size-10 rounded-full glass flex items-center justify-center">
              <MailCheck className="size-5 text-accent-emerald" />
            </div>
          </div>
          <p className="font-medium">Check your email</p>
          <p className="text-sm text-muted-foreground">
            We&apos;ve sent a reset link to <strong className="text-foreground">{email}</strong>
          </p>
          <p className="text-xs text-muted-foreground/70">
            Link expires in 24 hours. Check your spam folder if you don&apos;t see it.
          </p>
        </div>

        <button
          onClick={() => { setIsSubmitted(false); setEmail(""); }}
          className="w-full glass rounded-lg px-4 py-2.5 text-sm hover:bg-white/[0.06] transition"
        >
          Try another email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
          Email address
        </label>
        <input
          id="email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          className="mt-1.5 w-full glass rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-violet/40 disabled:opacity-50 placeholder:text-muted-foreground/60"
        />
        <p className="mt-1 text-xs text-muted-foreground/70">
          Enter the email associated with your account
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:bg-foreground/90 transition disabled:opacity-50 disabled:pointer-events-none"
      >
        {isLoading ? (
          <><Loader2 className="size-4 animate-spin" /> Sending…</>
        ) : (
          "Send reset link"
        )}
      </button>
    </form>
  );
}
