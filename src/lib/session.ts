export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "counselor" | "staff" | "viewer" | string;
};

/** Reads the non-httpOnly `user_info` cookie set by /api/auth/login.
 * Display + UI-gating only - never trusted for actual authorization,
 * which the FastAPI backend enforces on every request regardless. */
export function readClientSession(): SessionUser | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )user_info=([^;]*)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as SessionUser;
  } catch {
    return null;
  }
}

export function canWrite(role: string | undefined): boolean {
  return role !== undefined && role !== "viewer";
}

export function canDelete(role: string | undefined): boolean {
  return role === "admin" || role === "staff";
}
