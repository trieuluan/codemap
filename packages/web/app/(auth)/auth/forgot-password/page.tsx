import { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { Logo } from "@/components/logo";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your CodeMap password",
};

export default function ForgotPasswordPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="card ring-glow p-8 space-y-6">
          <div className="flex flex-col items-center space-y-2 text-center">
            <Link href="/" className="mb-2">
              <Logo className="text-white" />
            </Link>
            <h1 className="text-xl font-semibold text-white">Reset password</h1>
            <p className="text-sm text-ink-100">
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          <ForgotPasswordForm />

          <p className="text-center text-sm text-ink-200">
            Remember your password?{" "}
            <Link href="/auth" className="text-ink-50 underline-offset-4 hover:text-white hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
