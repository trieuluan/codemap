import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const DEFAULT_REDIRECT = "/dashboard";
const PROTECTED_ROUTES = ["/dashboard", "/projects", "/w", "/admin", "/account", "/settings"];
const GUEST_ONLY_ROUTES = ["/auth"];

function getApiBaseUrl() {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  );
}

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function getSafeRedirect(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_REDIRECT;
  }

  return value;
}

async function hasValidSession(request: NextRequest) {
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    return false;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
      headers: {
        cookie,
      },
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const authenticated = await hasValidSession(request);
  const isProtectedRoute = matchesRoute(pathname, PROTECTED_ROUTES);
  const isGuestOnlyRoute = matchesRoute(pathname, GUEST_ONLY_ROUTES);

  if (authenticated && isGuestOnlyRoute) {
    const redirectTo = getSafeRedirect(searchParams.get("redirect"));
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  if (!authenticated && isProtectedRoute) {
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/w/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/settings/:path*",
    "/auth",
    "/auth/:path*",
  ],
};
