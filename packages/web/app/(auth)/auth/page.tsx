import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/features/auth/login-form";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your CodeMap account",
};

async function hasValidSession() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  if (!cookieHeader) {
    return false;
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  try {
    const response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirect?: string }>;
}) {
  const authenticated = await hasValidSession();

  if (authenticated) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    redirect(resolvedSearchParams?.redirect || "/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <Link href="/" className="mb-4">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your account to continue
          </p>
        </div>

        <LoginForm />

        <p className="text-center text-sm text-muted-foreground">
          {"Don't have an account? "}
          <Link
            href="/auth/signup"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
