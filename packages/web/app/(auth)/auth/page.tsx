import { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/features/auth/login-form";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your CodeMap account",
};

interface AuthPageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const { redirect } = await searchParams;
  const signupHref = redirect
    ? `/auth/signup?redirect=${encodeURIComponent(redirect)}`
    : "/auth/signup";

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6">
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" aria-hidden />

      <div className="relative w-full max-w-md">
        <div className="glass-card p-8">
          {/* Logo + brand */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-3">
              <Logo showText={false} size={28} />
              <div className="absolute inset-0 -z-10 blur-xl bg-accent-violet/40" />
            </div>
            <p className="text-sm text-muted-foreground">CodeMap</p>
            <h1 className="text-2xl font-semibold mt-2">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to your account to continue
            </p>
          </div>

          <Suspense
            fallback={
              <div className="h-9 rounded-lg border border-border bg-white/[0.03] animate-pulse" />
            }
          >
            <LoginForm />
          </Suspense>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {"Don't have an account? "}
            <Link href={signupHref} className="text-foreground hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
