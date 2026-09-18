"use client";

import { useListApplicationsApplicationsGet } from "@/lib/api-client/generated";
import type { ApplicationResponse } from "@/lib/api-client/generated/models";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// List view only for this checkpoint. Create/edit needs an applicant
// picker (applicant_id is a required FK) - deferred until the Applicants
// page's own CRUD is fleshed out past its minimal create form, so there's
// a real list of applicants to pick from.
export default function ApplicationsPage() {
  const listQuery = useListApplicationsApplicationsGet({ limit: 50, offset: 0 });
  const applications: ApplicationResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Applications</h1>
        <p className="text-sm text-muted-foreground">
          {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          {" · "}create/edit coming next (needs applicant picker)
        </p>
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load applications.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application no.</TableHead>
              <TableHead>Programme</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Seat type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.application_no ?? "-"}</TableCell>
                <TableCell>{a.programme}</TableCell>
                <TableCell>{a.department}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{a.application_stage ?? "Draft"}</Badge>
                </TableCell>
                <TableCell>{a.allotted_seat_type ?? "-"}</TableCell>
              </TableRow>
            ))}
            {applications.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No applications yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
