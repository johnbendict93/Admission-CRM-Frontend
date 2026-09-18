"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { registerUnauthorizedHandler } from "@/lib/api-client/api-mutator";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      })
  );

  // Register the shared 401/403 handler once. See api-mutator.ts for why
  // both cases end up here: dead session or forbidden role both mean "the
  // current client-side session can no longer be trusted, start over."
  useState(() => {
    registerUnauthorizedHandler(() => {
      fetch("/api/auth/logout", { method: "POST" }).finally(() => {
        queryClient.clear();
        router.push("/login");
      });
    });
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
