// Central config — all env vars in one place.
// NEXT_PUBLIC_* are available on both server and client (baked at build time).
// Non-prefixed vars are server-only (SSR / Server Components).

export const config = {
  // Public — available in browser
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  paypalClientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "",

  // Server-only — for SSR / Server Components
  apiInternalUrl:
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001",

  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",
} as const;
