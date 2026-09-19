"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListCounselingSessionsCounselingSessionsGet,
  useCreateCounselingSessionCounselingSessionsPost,
  useUpdateCounselingSessionCounselingSessionsCounselingSessionIdPatch,
  useDeleteCounselingSessionCounselingSessionsCounselingSessionIdDelete,
  getListCounselingSessionsCounselingSessionsGetQueryKey,
  useListApplicantsApplicantsGet,
  useListApplicationsApplicationsGet,
} from "@/lib/api-client/generated";
import type { CounselingSessionResponse } from "@/lib/api-client/generated/models";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readClientSession, canWrite, canDelete } from "@/lib/session";

// Mirrors app/models/counseling_sessions.py's CounselingSessionBase
// exactly. mode/outcome/session_type ARE rendered as <Select> because the
// model's own comments confirm real DB CHECK constraints for all three -
// unlike every free-text field elsewhere in this module. application_id is
// a nullable FK to applications(id) with no cascade; it's offered as an
// optional picker with an explicit "None" option since applications
// already has its own generated list hook, matching the picker pattern
// used elsewhere. topics_discussed is a native Postgres text[] column
// (confirmed round-tripped as a plain JSON array in
// tests/test_counseling_sessions.py); it's edited here as a
// comma-separated string and split/joined at the form boundary.
//
// KNOWN GAP - counselor_id: this is a required FK to users(id), but no
// endpoint anywhere in this API exposes that table (confirmed via
// app/main.py's include_router calls - no /users router exists at all,
// only a one-shot POST /auth/login). The `telecallers` table was
// considered as a substitute picker source, but it's a wholly separate
// table with its own unrelated id column (no FK relationship to users),
// so sourcing options from it would either violate this FK constraint
// outright or, worse, silently attribute a session to the wrong person
// if a telecaller id ever happened to collide with a real user id.
// There is no data anywhere in this API that can back a real dropdown
// here. Left as a free-text UUID input with an explicit inline warning
// (not just placeholder text, which is easy to miss) - revisit this the
// moment a GET /users or GET /staff endpoint exists, then swap this for
// the same <Select> picker pattern used for applicant_id/lead_id.
const MODES = ["In-Person", "Remote"] as const;
const OUTCOMES = [
  "Interested",
  "Not Interested",
  "Need More Time",
  "Documents Requested",
  "Fee Discussed",
  "Confirmed",
  "Dropped",
  "Callback Scheduled",
  "Other",
] as const;
const SESSION_TYPES = [
  "Walk-in",
  "Phone Call",
  "Video Call",
  "WhatsApp",
  "Email",
  "Home Visit",
  "School Visit",
  "Camp",
  "Follow-up",
] as const;

const NONE_APPLICATION = "__none__";

type CounselingSessionFormValues = {
  applicant_id: string;
  application_id: string; // NONE_APPLICATION means null
  counselor_id: string;
  mode: string;
  outcome: string;
  session_type: string;
  topics_discussed: string; // comma-separated in the form
  session_date: string;
  duration_mins: string;
  next_action: string;
  next_action_date: string;
  notes: string;
};

const emptyForm: CounselingSessionFormValues = {
  applicant_id: "",
  application_id: NONE_APPLICATION,
  counselor_id: "",
  mode: "In-Person",
  outcome: "",
  session_type: "",
  topics_discussed: "",
  session_date: "",
  duration_mins: "",
  next_action: "",
  next_action_date: "",
  notes: "",
};

const str = (v: string | null | undefined) => v ?? "";

// session_date is a datetime column (DB default now()); reuse the same
// naive-local-input convention as the rest of the app for datetime-local
// fields (no timezone conversion here - only call_schedules.scheduled_time
// has the tz-aware backend validator that requires the IST offset dance).
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffsetMs = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

export default function CounselingSessionsPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CounselingSessionResponse | null>(null);
  const [form, setForm] = useState<CounselingSessionFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListCounselingSessionsCounselingSessionsGet({ limit: 100, offset: 0 });
  const applicantsQuery = useListApplicantsApplicantsGet({ limit: 200, offset: 0 });
  const applicationsQuery = useListApplicationsApplicationsGet({ limit: 200, offset: 0 });
  const createMutation = useCreateCounselingSessionCounselingSessionsPost();
  const updateMutation = useUpdateCounselingSessionCounselingSessionsCounselingSessionIdPatch();
  const deleteMutation = useDeleteCounselingSessionCounselingSessionsCounselingSessionIdDelete();

  const items: CounselingSessionResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];
  const applicants = useMemo(
    () => (applicantsQuery.data?.status === 200 ? applicantsQuery.data.data.items : []),
    [applicantsQuery.data]
  );
  const applications = useMemo(
    () => (applicationsQuery.data?.status === 200 ? applicationsQuery.data.data.items : []),
    [applicationsQuery.data]
  );
  const applicantLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of applicants) {
      map.set(a.id, `${a.first_name} ${a.last_name}${a.reg_number ? ` (${a.reg_number})` : ""}`);
    }
    return (id: string) => map.get(id) ?? id;
  }, [applicants]);
  const applicationLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of applications) map.set(app.id, app.application_no ?? app.id);
    return (id: string | null | undefined) => (id ? map.get(id) ?? id : "-");
  }, [applications]);

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListCounselingSessionsCounselingSessionsGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: CounselingSessionResponse) => {
    setEditing(item);
    setForm({
      applicant_id: item.applicant_id,
      application_id: item.application_id ?? NONE_APPLICATION,
      counselor_id: item.counselor_id,
      mode: str(item.mode) || "In-Person",
      outcome: str(item.outcome),
      session_type: str(item.session_type),
      topics_discussed: (item.topics_discussed ?? []).join(", "),
      session_date: toLocalInput(item.session_date as unknown as string),
      duration_mins: item.duration_mins != null ? String(item.duration_mins) : "",
      next_action: str(item.next_action),
      next_action_date: str(item.next_action_date as unknown as string),
      notes: str(item.notes),
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.applicant_id) {
      toast.error("Pick an applicant first.");
      return;
    }
    if (!form.counselor_id) {
      toast.error("Counselor ID is required.");
      return;
    }
    if (!form.session_type) {
      toast.error("Pick a session type first.");
      return;
    }
    const topics = form.topics_discussed
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const payload = {
      applicant_id: form.applicant_id,
      application_id: form.application_id === NONE_APPLICATION ? null : form.application_id,
      counselor_id: form.counselor_id,
      mode: form.mode || null,
      outcome: form.outcome || null,
      session_type: form.session_type,
      topics_discussed: topics.length > 0 ? topics : null,
      session_date: form.session_date ? new Date(form.session_date).toISOString() : null,
      duration_mins: form.duration_mins ? Number(form.duration_mins) : null,
      next_action: form.next_action || null,
      next_action_date: form.next_action_date || null,
      notes: form.notes || null,
    };

    if (editing) {
      updateMutation.mutate(
        { counselingSessionId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Counseling session updated");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 201) {
              toast.success("Counseling session created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: CounselingSessionResponse) => {
    if (!confirm(`Delete this counseling session for "${applicantLabel(item.applicant_id)}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { counselingSessionId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Counseling session deleted");
            invalidateList();
          }
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Counseling Sessions</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          </p>
        </div>
        {canWrite(role) && (
          <Button onClick={openCreate} disabled={applicants.length === 0}>
            New session
          </Button>
        )}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load counseling sessions.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Application</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Session type</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{applicantLabel(item.applicant_id)}</TableCell>
                <TableCell>{applicationLabel(item.application_id)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.mode ?? "In-Person"}</Badge>
                </TableCell>
                <TableCell>{item.session_type ?? "-"}</TableCell>
                <TableCell>{item.outcome ?? "-"}</TableCell>
                <TableCell className="text-right space-x-2">
                  {canWrite(role) && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                      Edit
                    </Button>
                  )}
                  {canDelete(role) && (
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(item)}>
                      Delete
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No counseling sessions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit counseling session" : "New counseling session"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="applicant_id">Applicant *</Label>
              <Select
                value={form.applicant_id}
                onValueChange={(v) => setForm({ ...form, applicant_id: v })}
                disabled={!!editing}
              >
                <SelectTrigger id="applicant_id">
                  <SelectValue placeholder="Select an applicant" />
                </SelectTrigger>
                <SelectContent>
                  {applicants.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.first_name} {a.last_name}
                      {a.reg_number ? ` (${a.reg_number})` : ` - ${a.phone}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="application_id">Application (optional)</Label>
              <Select
                value={form.application_id}
                onValueChange={(v) => setForm({ ...form, application_id: v })}
                disabled={!!editing}
              >
                <SelectTrigger id="application_id">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_APPLICATION}>None</SelectItem>
                  {applications.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.application_no ?? app.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="counselor_id">Counselor ID *</Label>
              <Input
                id="counselor_id"
                required
                placeholder="Paste a user UUID"
                value={form.counselor_id}
                onChange={(e) => setForm({ ...form, counselor_id: e.target.value })}
              />
              <p className="text-xs text-amber-600">
                Known gap: there&apos;s no staff directory in this API yet, so
                this has to be the counselor&apos;s raw user ID rather than a
                name picker. Ask an admin for it, or check the Supabase{" "}
                <code className="font-mono">users</code> table. This will
                become a proper dropdown once a users/staff endpoint exists.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mode">Mode</Label>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                  <SelectTrigger id="mode">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="session_type">Session type *</Label>
                <Select
                  value={form.session_type}
                  onValueChange={(v) => setForm({ ...form, session_type: v })}
                >
                  <SelectTrigger id="session_type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SESSION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outcome">Outcome</Label>
              <Select value={form.outcome} onValueChange={(v) => setForm({ ...form, outcome: v })}>
                <SelectTrigger id="outcome">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topics_discussed">Topics discussed</Label>
              <Input
                id="topics_discussed"
                placeholder="Comma-separated, e.g. Fees, Hostel, Placements"
                value={form.topics_discussed}
                onChange={(e) => setForm({ ...form, topics_discussed: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="session_date">Session date/time</Label>
                <Input
                  id="session_date"
                  type="datetime-local"
                  value={form.session_date}
                  onChange={(e) => setForm({ ...form, session_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="duration_mins">Duration (mins)</Label>
                <Input
                  id="duration_mins"
                  type="number"
                  value={form.duration_mins}
                  onChange={(e) => setForm({ ...form, duration_mins: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="next_action">Next action</Label>
                <Input
                  id="next_action"
                  value={form.next_action}
                  onChange={(e) => setForm({ ...form, next_action: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="next_action_date">Next action date</Label>
                <Input
                  id="next_action_date"
                  type="date"
                  value={form.next_action_date}
                  onChange={(e) => setForm({ ...form, next_action_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? "Save changes" : "Create session"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
