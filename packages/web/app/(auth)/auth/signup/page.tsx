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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <Link href="/" className="mb-4">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Get started</h1>
          <p className="text-sm text-muted-foreground">
            Create your account and start mapping your codebase
          </p>
        </div>

        <Suspense
          fallback={
            <div className="h-9 rounded-md border border-border bg-secondary/40" />
          }
        >
          <SignupForm />
        </Suspense>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={signinHref}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
