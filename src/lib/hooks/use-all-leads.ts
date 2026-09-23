"use client";

import { useQuery } from "@tanstack/react-query";
import { listLeadsLeadsGet } from "@/lib/api-client/generated";
import type { LeadResponse } from "@/lib/api-client/generated/models";

// GET /leads caps `limit` at 200 (app/routers/leads.py), so a single
// `{ limit: 200 }` fetch silently misses every lead past the first 200 -
// which is why Followups etc. showed raw lead UUIDs instead of names once
// dev grew past 200 leads. This pages through ALL leads (200 at a time,
// following `has_more`) and returns one flat list for pickers and
// id -> name lookups. Fine at hundreds/low-thousands of leads; beyond that
// this should become a searchable combobox or a backend ?ids= filter.
const PAGE = 200;
const MAX_PAGES = 50; // safety stop: 10,000 leads

export const ALL_LEADS_QUERY_KEY = ["/leads/", "all"] as const;

export function useAllLeads() {
  return useQuery<LeadResponse[]>({
    queryKey: ALL_LEADS_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const all: LeadResponse[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await listLeadsLeadsGet({ limit: PAGE, offset: page * PAGE }, { signal });
        if (res.status !== 200) {
          throw new Error(`Loading leads failed (server error ${res.status})`);
        }
        all.push(...res.data.items);
        if (!res.data.has_more || res.data.items.length === 0) break;
      }
      return all;
    },
    staleTime: 60_000,
  });
}
