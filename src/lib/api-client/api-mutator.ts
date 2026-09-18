import { toast } from "sonner";

/**
 * Shared 401/403 handling - decided once here rather than ad hoc per page,
 * per the scoping doc follow-up:
 *
 *  - 401 (invalid/expired token): the BFF proxy (api/backend/[...path])
 *    already cleared the auth cookies server-side. We just surface a toast
 *    and run the registered "session ended" handler, which redirects to
 *    /login.
 *  - 403 (role forbidden - e.g. a viewer hitting a write endpoint, or an
 *    admin who got demoted to viewer mid-session so the UI's cached role
 *    is stale): the JWT itself may still be valid, so this isn't
 *    technically a dead session, but there's no cheap "just refetch my
 *    role" endpoint (no /auth/me). Rather than leave the UI showing
 *    controls that will keep 403ing, we treat it the same as a session
 *    end: toast explaining why, then force logout + redirect to /login so
 *    the next sign-in picks up the current role. One path for every page,
 *    not bespoke handling per mutation.
 *
 * registerUnauthorizedHandler is called once, high in the tree (see
 * components/providers.tsx), so this module doesn't import React/router
 * code directly.
 */
let onUnauthorized: (() => void) | null = null;

export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((e) =>
          typeof e === "object" && e && "msg" in e
            ? String((e as { msg: unknown }).msg)
            : JSON.stringify(e)
        )
        .join("; ");
    }
    if (detail) return JSON.stringify(detail);
  }
  return `Request failed (${status})`;
}

/**
 * Orval's "fetch" client contract: takes the already-built relative URL +
 * RequestInit from each generated function, and must resolve to
 * { data, status, headers } (the generated *Response types are unions
 * over `status`, discriminating success vs. HTTPValidationError bodies).
 * All requests are routed through our own Next.js BFF proxy
 * (/api/backend/...), which is what actually attaches the bearer token
 * server-side - the browser never sees it.
 */
export const apiFetch = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`/api/backend${url}`, {
    ...options,
    credentials: "include",
  });

  const contentType = res.headers.get("Content-Type") ?? "";
  const raw = await res.text();
  const body = raw && contentType.includes("application/json") ? JSON.parse(raw) : raw || undefined;

  if (res.status === 401) {
    toast.error("Your session has expired. Please sign in again.");
    onUnauthorized?.();
  } else if (res.status === 403) {
    toast.error(
      "You don't have permission to do that. Signing you out to refresh your session."
    );
    onUnauthorized?.();
  } else if (!res.ok) {
    toast.error(extractErrorMessage(body, res.status));
  }

  return { data: body, status: res.status, headers: res.headers } as T;
};
