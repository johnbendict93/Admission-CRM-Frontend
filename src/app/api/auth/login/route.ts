import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_API_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const credentials = await req.json();

    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(
        { detail: body.detail ?? "Login failed" },
        { status: res.status }
      );
    }

    const data = await res.json();
    const isProd = process.env.NODE_ENV === "production";
    const eightHours = 60 * 60 * 8;

    const response = NextResponse.json({ user: data.user });
    response.cookies.set("session", data.access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: eightHours,
    });
    response.cookies.set(
      "user_info",
      JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.full_name,
        role: data.user.role,
      }),
      {
        httpOnly: false,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: eightHours,
      }
    );
    return response;
  } catch (err) {
    console.error("LOGIN_ROUTE_ERROR", err);
    return NextResponse.json(
      { detail: `login route threw: ${err instanceof Error ? err.stack : String(err)}` },
      { status: 500 }
    );
  }
}
