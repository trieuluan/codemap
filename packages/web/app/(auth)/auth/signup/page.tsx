import { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/features/auth/signup-form";
import { Logo } from "@/components/logo";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your CodeMap account",
};

interface SignupPageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { redirect } = await searchParams;
  const signinHref = redirect
    ? `/auth?redirect=${encodeURIComponent(redirect)}`
    : "/auth";

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-12">
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" aria-hidden />

      <div className="relative w-full max-w-md">
        <div className="glass-card p-8">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-3">
              <Logo showText={false} size={28} />
              <div className="absolute inset-0 -z-10 blur-xl bg-accent-violet/40" />
            </div>
            <p className="text-sm text-muted-foreground">CodeMap</p>
            <h1 className="text-2xl font-semibold mt-2">Get started</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create your account and start mapping your codebase
            </p>
          </div>

          <Suspense
            fallback={
              <div className="h-9 rounded-lg border border-border bg-white/[0.03] animate-pulse" />
            }
          >
            <SignupForm />
          </Suspense>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={signinHref} className="text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
