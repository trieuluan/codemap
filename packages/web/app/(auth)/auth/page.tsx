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
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="card ring-glow p-8 space-y-6">
          <div className="flex flex-col items-center space-y-2 text-center">
            <Link href="/" className="mb-2">
              <Logo className="text-white" />
            </Link>
            <h1 className="text-xl font-semibold text-white">Welcome back</h1>
            <p className="text-sm text-ink-100">Sign in to your account to continue</p>
          </div>

          <Suspense
            fallback={
              <div className="h-9 rounded-md border border-white/10 bg-white/5" />
            }
          >
            <LoginForm />
          </Suspense>

          <p className="text-center text-sm text-ink-200">
            {"Don't have an account? "}
            <Link href={signupHref} className="text-ink-50 underline-offset-4 hover:text-white hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
