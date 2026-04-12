import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function hasValidSession(request: NextRequest) {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    return false;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/auth/me`, {
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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const authenticated = await hasValidSession(request);

  if (authenticated) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/auth", request.url);
  const redirectTo = `${pathname}${search}`;

  loginUrl.searchParams.set("redirect", redirectTo);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
