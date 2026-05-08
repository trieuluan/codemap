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
    <div className="relative min-h-screen flex items-center justify-center px-6">
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" aria-hidden />

      <div className="relative w-full max-w-md">
        <div className="glass-card p-8">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-3">
              <Logo showText={false} size={28} />
              <div className="absolute inset-0 -z-10 blur-xl bg-accent-violet/40" />
            </div>
            <p className="text-sm text-muted-foreground">CodeMap</p>
            <h1 className="text-2xl font-semibold mt-2">Reset password</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          <ForgotPasswordForm />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link href="/auth" className="text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
