import { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { Logo } from "@/components/logo";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your CodeMap password",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <Link href="/" className="mb-4">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reset password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your email address and we&apos;ll send you a link to reset
            your password
          </p>
        </div>

        <ForgotPasswordForm />

        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <Link
            href="/auth"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
