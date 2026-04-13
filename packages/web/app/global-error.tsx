"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
            <div className="space-y-3">
              <p className="text-sm font-medium text-destructive">
                Application error
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                Something went wrong while loading this page
              </h1>
              <p className="text-sm text-muted-foreground">
                {error.message || "An unexpected error occurred."}
              </p>
              {error.digest ? (
                <p className="text-xs text-muted-foreground">
                  Error reference: {error.digest}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Try again
              </button>
              <a
                href="/"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Back home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
