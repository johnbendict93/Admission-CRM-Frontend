"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readClientSession, type SessionUser } from "@/lib/session";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/applicants", label: "Applicants" },
  { href: "/applications", label: "Applications" },
  { href: "/fee-payments", label: "Fee Payments" },
  { href: "/document-types", label: "Document Types" },
  { href: "/settings", label: "Settings" },
  { href: "/lookup-values", label: "Lookup Values" },
  { href: "/scholarships", label: "Scholarships" },
  { href: "/hostel-allotments", label: "Hostel Allotments" },
  { href: "/telecallers", label: "Telecallers" },
  { href: "/call-schedules", label: "Call Schedules" },
  { href: "/campus-visits", label: "Campus Visits" },
  { href: "/followups", label: "Followups" },
  { href: "/counseling-sessions", label: "Counseling Sessions" },
  { href: "/reports", label: "Reports" },
];

// Shown only to admins (the API enforces this too; this just hides the link).
const ADMIN_NAV_ITEMS = [{ href: "/users", label: "Users" }];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    // Same reasoning as the page-level role reads: cookie is client-only,
    // deferred to after mount to avoid an SSR/CSR mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(readClientSession());
  }, [pathname]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-muted/30 p-4 flex flex-col gap-1 overflow-y-auto">
        <div className="mb-4 px-2">
          <p className="text-sm font-semibold">Admission CRM</p>
          <p className="text-xs text-muted-foreground">Phase A + B + C + D</p>
        </div>
        {(user?.role === "admin" ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-2 py-1.5 text-sm ${
              pathname.startsWith(item.href)
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <div className="text-sm text-muted-foreground">
            {user ? (
              <span>
                {user.full_name} · <span className="capitalize">{user.role}</span>
              </span>
            ) : (
              <span>&nbsp;</span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Sign out
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
