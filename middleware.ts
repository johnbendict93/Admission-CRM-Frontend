import { NextRequest, NextResponse } from "next/server";

/**
 * Shared route gate: everything requires a session cookie except /login
 * and the two auth API routes. This is a presence check only (fast, runs
 * on the edge) - it is NOT the security boundary. The FastAPI backend
 * re-verifies the JWT signature and re-checks the role from the database
 * on every single request regardless of what this middleware decides;
 * this just avoids flashing protected pages before redirecting to /login
 * for an obviously signed-out visitor.
 */
const PUBLIC_PATHS = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const session = req.cookies.get("session");
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/backend).*)"],
};
