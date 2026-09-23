"use client";

import { useMemo } from "react";
import {
  useListLeadsLeadsGet,
  useListApplicationsApplicationsGet,
  useListCallSchedulesCallSchedulesGet,
  useListFollowupsFollowupsGet,
  useGetSourceRoiMlSourcePerformanceGet,
  useGetDemandForecastMlDemandForecastYearMonthGet,
} from "@/lib/api-client/generated";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

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

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "\u2013" : `${(v * 100).toFixed(0)}%`;

// Module 15 - Source ROI. Aggregated live from all leads on every request
// (app/services/ml_source_roi_service.py), no trained model, so no
// version-skew failure path. Rates are 0-1 fractions. Backend already
// sorts by resolved_conversion_rate desc (sources with none go last).
function SourcePerformanceCard() {
  const query = useGetSourceRoiMlSourcePerformanceGet();
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Lead source performance</h3>
      {query.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {((query.data && query.data.status !== 200) || query.isError) && (
        <p className="text-sm text-muted-foreground">Not available.</p>
      )}
      {query.data?.status === 200 && (
        <>
          {query.data.data.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">Lost</TableHead>
                  <TableHead className="text-right">Still open</TableHead>
                  <TableHead className="text-right">Win rate (decided)</TableHead>
                  <TableHead className="text-right">Win rate (all)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.data.sources.map((s) => (
                  <TableRow key={s.source}>
                    <TableCell className="font-medium">
                      {s.source}
                      {s.low_sample && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          few leads
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{s.total_leads}</TableCell>
                    <TableCell className="text-right">{s.enrolled_count}</TableCell>
                    <TableCell className="text-right">{s.lost_count}</TableCell>
                    <TableCell className="text-right">{s.unresolved_count}</TableCell>
                    <TableCell className="text-right font-medium">
                      {pct(s.resolved_conversion_rate)}
                    </TableCell>
                    <TableCell className="text-right">{pct(s.overall_conversion_rate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-xs text-muted-foreground">
            {"\u201cWin rate (decided)\u201d = enrolled \u00f7 (enrolled + lost), ignoring leads still in progress. Cost per source isn\u2019t tracked, so this is conversion, not true money ROI."}
          </p>
        </>
      )}
    </div>
  );
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Module 20 - one cell per calendar month. A child component so each month
// gets its own hook call (hooks can't be called in a loop). year/month are
// path params; backend enforces year >= BASE_YEAR (2023) - the next 3
// months from today are always well past that.
function ForecastMonth({ year, month }: { year: number; month: number }) {
  const query = useGetDemandForecastMlDemandForecastYearMonthGet(year, month);
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm text-muted-foreground">
        {MONTH_NAMES[month - 1]} {year}
      </p>
      {query.isLoading && <p className="text-lg text-muted-foreground">...</p>}
      {query.data?.status === 200 && (
        <p className="text-2xl font-semibold">
          {`~${Math.round(query.data.data.predicted_enquiry_count)}`}
        </p>
      )}
      {((query.data && query.data.status !== 200) || query.isError) && (
        <p className="text-sm text-muted-foreground">Not available.</p>
      )}
    </div>
  );
}

function DemandForecastCard({ now }: { now: Date }) {
  const months = [1, 2, 3].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        Expected enquiries {"\u2013"} next 3 months
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {months.map((m) => (
          <ForecastMonth key={`${m.year}-${m.month}`} year={m.year} month={m.month} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {"Forecast from an ML model trained on sample data \u2014 treat as a guide, not a guarantee."}
      </p>
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

      <h2 className="text-lg font-semibold">AI Insights</h2>
      <DemandForecastCard now={now} />
      <SourcePerformanceCard />
    </div>
  );
}
