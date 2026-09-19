"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  listLeadsLeadsGet,
  listApplicantsApplicantsGet,
  listApplicationsApplicationsGet,
  listFeePaymentsFeePaymentsGet,
  listScholarshipsScholarshipsGet,
  listHostelAllotmentsHostelAllotmentsGet,
  listTelecallersTelecallersGet,
  listCallSchedulesCallSchedulesGet,
  listCampusVisitsCampusVisitsGet,
  listFollowupsFollowupsGet,
  listCounselingSessionsCounselingSessionsGet,
  listDocumentTypesDocumentTypesGet,
  listLookupValuesLookupValuesGet,
  listSettingsSettingsGet,
} from "@/lib/api-client/generated";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

// Phase D, second half. The scoping doc flagged "client-side vs.
// server-side export" as an open question with no dedicated export
// endpoint - since none has been added, this goes client-side.
//
// Every one of the 14 list endpoints caps `limit` at 200 server-side
// (confirmed via `Query(50, ge=1, le=200)` on every router - not just
// leads) - an earlier version of this page tried limit=1000 in one shot
// and got a 422 back, caught during live testing rather than assumed to
// work. So this calls each module's raw generated list function
// (not the query hook, since a hook's params are fixed at creation and
// can't paginate) directly in a loop, paging through with `has_more`
// until every row is fetched, capped at 50 pages (10,000 rows) as a
// sanity ceiling against a runaway loop rather than a real limit anyone
// should hit with this dataset's actual size.
//
// Serializes straight to CSV with no fixed column list per module, so
// this stays generic across all 14 modules instead of hand-maintaining
// 14 column schemas that drift from the actual API shape.
// The generated response types are discriminated unions (200 success |
// 422 HTTPValidationError), which differ per module, so this is typed
// loosely here and narrowed at the call site with the same
// `status === 200` runtime check used throughout the rest of the app.
type ListFn = (params: { limit: number; offset: number }) => Promise<{
  status: number;
  data: unknown;
}>;

const MODULES: { label: string; listFn: ListFn }[] = [
  { label: "Leads", listFn: listLeadsLeadsGet },
  { label: "Applicants", listFn: listApplicantsApplicantsGet },
  { label: "Applications", listFn: listApplicationsApplicationsGet },
  { label: "Fee Payments", listFn: listFeePaymentsFeePaymentsGet },
  { label: "Scholarships", listFn: listScholarshipsScholarshipsGet },
  { label: "Hostel Allotments", listFn: listHostelAllotmentsHostelAllotmentsGet },
  { label: "Telecallers", listFn: listTelecallersTelecallersGet },
  { label: "Call Schedules", listFn: listCallSchedulesCallSchedulesGet },
  { label: "Campus Visits", listFn: listCampusVisitsCampusVisitsGet },
  { label: "Followups", listFn: listFollowupsFollowupsGet },
  { label: "Counseling Sessions", listFn: listCounselingSessionsCounselingSessionsGet },
  { label: "Document Types", listFn: listDocumentTypesDocumentTypesGet },
  { label: "Lookup Values", listFn: listLookupValuesLookupValuesGet },
  { label: "Settings", listFn: listSettingsSettingsGet },
];

const PAGE_SIZE = 200;
const MAX_PAGES = 50;

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c])).join(","));
  }
  return lines.join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (label: string, listFn: ListFn) => {
    setExporting(label);
    try {
      const allRows: Record<string, unknown>[] = [];
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await listFn({ limit: PAGE_SIZE, offset });
        if (res.status !== 200) {
          toast.error(`Couldn't load ${label} for export.`);
          return;
        }
        const page = res.data as { items: Record<string, unknown>[]; has_more: boolean };
        allRows.push(...page.items);
        if (!page.has_more) break;
        offset += PAGE_SIZE;
      }
      if (allRows.length === 0) {
        toast.error(`No ${label} rows to export.`);
        return;
      }
      const filename = `${label.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCsv(filename, toCsv(allRows));
      toast.success(`Exported ${allRows.length} ${label} row${allRows.length === 1 ? "" : "s"}.`);
    } catch {
      toast.error(`Couldn't load ${label} for export.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Export any module&apos;s current data as CSV &mdash; pages through
          all rows automatically (the API caps each request at 200 rows).
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Module</TableHead>
            <TableHead className="text-right">Export</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MODULES.map(({ label, listFn }) => (
            <TableRow key={label}>
              <TableCell className="font-medium">{label}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting !== null}
                  onClick={() => handleExport(label, listFn)}
                >
                  {exporting === label ? "Exporting..." : "Export CSV"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
