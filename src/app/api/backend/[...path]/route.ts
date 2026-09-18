import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_API_URL ?? "http://localhost:8000";

/**
 * BFF proxy: every generated hook's apiFetch() call hits this route
 * (never the FastAPI backend directly from the browser). It attaches the
 * real bearer token server-side from the httpOnly session cookie, so the
 * token never has to touch client JS. On a 401 from the backend (expired/
 * revoked token) it also clears both auth cookies here, so the client-side
 * 401 handler in api-mutator.ts doesn't need a separate logout call.
 */
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  const url = new URL(req.url);
  const target = `${BACKEND_URL}/${path.join("/")}${url.search}`;

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.text() : undefined;

  const backendRes = await fetch(target, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  const responseText = await backendRes.text();
  const response = new NextResponse(responseText || null, {
    status: backendRes.status,
  });
  response.headers.set(
    "Content-Type",
    backendRes.headers.get("Content-Type") ?? "application/json"
  );

  if (backendRes.status === 401) {
    response.cookies.delete("session");
    response.cookies.delete("user_info");
  }

  return response;
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as DELETE,
  proxy as PUT,
};
