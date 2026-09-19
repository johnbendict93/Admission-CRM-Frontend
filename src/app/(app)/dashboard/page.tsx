"use client";

import { useMemo } from "react";
import {
  useListLeadsLeadsGet,
  useListApplicationsApplicationsGet,
  useListCallSchedulesCallSchedulesGet,
  useListFollowupsFollowupsGet,
} from "@/lib/api-client/generated";
import { Badge } from "@/components/ui/badge";

// Phase D per the scoping doc: aggregates GET-list calls across
// leads/applications/call_schedules/followups for funnel counts and
// overdue alerts - the same shape as the old Streamlit Dashboard page,
// rebuilt on real data instead of ad hoc queries.
//
// Headline totals use each list endpoint's own `total` field, which the
// backend computes server-side across ALL matching rows regardless of
// `limit`/`offset` (see app/models/pagination.py) - so those numbers are
// exact, not capped by what got fetched.
//
// The status/stage breakdowns and the two overdue lists below them do
// need actual row data to group by, not just the total count, so they
// read from a `limit: 200` fetch - the same practical page size already
// used for every FK picker elsewhere in this app. On a dataset larger
// than 200 rows per module those breakdowns would undercount; there's no
// backend aggregation endpoint to do this server-side today, so this is
// a known scaling limit of the client-side approach, not a bug.
function groupCounts(values: (string | null | undefined)[], fallback: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) {
    const key = v && v.trim() ? v : fallback;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function StatusBreakdown({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map(([label, count]) => (
            <Badge key={label} variant="secondary" className="text-sm">
              {label}: {count}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const leadsQuery = useListLeadsLeadsGet({ limit: 200, offset: 0 });
  const applicationsQuery = useListApplicationsApplicationsGet({ limit: 200, offset: 0 });
  const callSchedulesQuery = useListCallSchedulesCallSchedulesGet({ limit: 200, offset: 0 });
  const followupsQuery = useListFollowupsFollowupsGet({ limit: 200, offset: 0 });

  const leadsTotal = leadsQuery.data?.status === 200 ? leadsQuery.data.data.total : null;
  const applicationsTotal =
    applicationsQuery.data?.status === 200 ? applicationsQuery.data.data.total : null;
  const callSchedulesTotal =
    callSchedulesQuery.data?.status === 200 ? callSchedulesQuery.data.data.total : null;
  const followupsTotal =
    followupsQuery.data?.status === 200 ? followupsQuery.data.data.total : null;

  const leads = useMemo(
    () => (leadsQuery.data?.status === 200 ? leadsQuery.data.data.items : []),
    [leadsQuery.data]
  );
  const applications = useMemo(
    () => (applicationsQuery.data?.status === 200 ? applicationsQuery.data.data.items : []),
    [applicationsQuery.data]
  );
  const callSchedules = useMemo(
    () => (callSchedulesQuery.data?.status === 200 ? callSchedulesQuery.data.data.items : []),
    [callSchedulesQuery.data]
  );
  const followups = useMemo(
    () => (followupsQuery.data?.status === 200 ? followupsQuery.data.data.items : []),
    [followupsQuery.data]
  );

  const leadStatusCounts = useMemo(
    () => groupCounts(leads.map((l) => l.status), "No status"),
    [leads]
  );
  const applicationStageCounts = useMemo(
    () => groupCounts(applications.map((a) => a.application_stage), "No stage"),
    [applications]
  );

  const now = useMemo(() => new Date(), []);

  // "Overdue" call schedule: scheduled_time already in the past and the
  // call is still sitting in a non-final status. call_schedules.status has
  // no DB CHECK constraint (confirmed in the Phase C audit - only a
  // 'Pending' default), so "final" here is a best-effort text match
  // against what this app's own forms actually write, not a fixed enum.
  const overdueCallSchedules = useMemo(
    () => {
      const finalStatuses = new Set(["completed", "done", "cancelled", "canceled"]);
      return callSchedules.filter((c) => {
        if (!c.scheduled_time) return false;
        const scheduled = new Date(c.scheduled_time);
        if (Number.isNaN(scheduled.getTime()) || scheduled >= now) return false;
        const status = (c.status ?? "pending").toLowerCase();
        return !finalStatuses.has(status);
      });
    },
    [callSchedules, now]
  );

  const overdueFollowups = useMemo(
    () =>
      followups.filter((f) => {
        if (!f.next_followup_date) return false;
        const due = new Date(f.next_followup_date);
        return !Number.isNaN(due.getTime()) && due < now;
      }),
    [followups, now]
  );

  const isLoading =
    leadsQuery.isLoading ||
    applicationsQuery.isLoading ||
    callSchedulesQuery.isLoading ||
    followupsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Funnel counts and overdue alerts across the admissions pipeline.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total leads" value={leadsTotal ?? "..."} />
        <StatCard label="Total applications" value={applicationsTotal ?? "..."} />
        <StatCard label="Total call schedules" value={callSchedulesTotal ?? "..."} />
        <StatCard label="Total followups" value={followupsTotal ?? "..."} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusBreakdown title="Leads by status" counts={leadStatusCounts} />
        <StatusBreakdown title="Applications by stage" counts={applicationStageCounts} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Overdue call schedules ({overdueCallSchedules.length})
          </h3>
          {overdueCallSchedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing overdue.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {overdueCallSchedules.slice(0, 10).map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>{c.scheduled_by ?? "Unassigned"}</span>
                  <span className="text-muted-foreground">
                    {new Date(c.scheduled_time as string).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Overdue followups ({overdueFollowups.length})
          </h3>
          {overdueFollowups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing overdue.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {overdueFollowups.slice(0, 10).map((f) => (
                <li key={f.id} className="flex justify-between gap-2">
                  <span>{f.called_by ?? "Unassigned"}</span>
                  <span className="text-muted-foreground">{f.next_followup_date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
