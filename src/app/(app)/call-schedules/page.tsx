"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListCallSchedulesCallSchedulesGet,
  useCreateCallScheduleCallSchedulesPost,
  useUpdateCallScheduleCallSchedulesCallScheduleIdPatch,
  useDeleteCallScheduleCallSchedulesCallScheduleIdDelete,
  getListCallSchedulesCallSchedulesGetQueryKey,
  useListLeadsLeadsGet,
} from "@/lib/api-client/generated";
import type { CallScheduleResponse } from "@/lib/api-client/generated/models";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readClientSession, canWrite, canDelete } from "@/lib/session";

// Mirrors app/models/call_schedules.py's CallScheduleBase exactly. This is
// the same table the Tier-2 timezone migration (0014) fixed this session:
// scheduled_time is timestamptz, and the backend's own validator REJECTS
// a naive datetime on write. India has no DST, so a fixed +05:30 offset
// (not a named zone) is exact here, matching the backend writer-side fix
// and the migration's own `AT TIME ZONE 'Asia/Kolkata'` conversion.
//
// <input type="datetime-local"> only gives/accepts a naive
// "YYYY-MM-DDTHH:mm" wall-clock string with no offset, so both
// directions need an explicit conversion:
//   - on submit: append ":00+05:30" to the input's value before sending,
//     satisfying the backend's tz-aware requirement directly and
//     unambiguously.
//   - on read: the API returns UTC (confirmed during the 0014 migration
//     verification - rows came back as "...+00"), so the ISO string is
//     shifted forward by 5.5 hours before slicing to the datetime-local
//     format, turning it back into the IST wall-clock time a human
//     expects to see in the field.
function toISTLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

function fromISTLocalInput(value: string): string | null {
  if (!value) return null;
  return `${value}:00+05:30`;
}

type CallScheduleFormValues = {
  lead_id: string;
  scheduled_by: string;
  scheduled_time: string;
  reminder_sent: boolean;
  status: string;
};

const emptyForm: CallScheduleFormValues = {
  lead_id: "",
  scheduled_by: "",
  scheduled_time: "",
  reminder_sent: false,
  status: "Pending",
};

const str = (v: string | null | undefined) => v ?? "";

export default function CallSchedulesPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CallScheduleResponse | null>(null);
  const [form, setForm] = useState<CallScheduleFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListCallSchedulesCallSchedulesGet({ limit: 100, offset: 0 });
  const leadsQuery = useListLeadsLeadsGet({ limit: 200, offset: 0 });
  const createMutation = useCreateCallScheduleCallSchedulesPost();
  const updateMutation = useUpdateCallScheduleCallSchedulesCallScheduleIdPatch();
  const deleteMutation = useDeleteCallScheduleCallSchedulesCallScheduleIdDelete();

  const items: CallScheduleResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];
  const leads = useMemo(
    () => (leadsQuery.data?.status === 200 ? leadsQuery.data.data.items : []),
    [leadsQuery.data]
  );
  const leadLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of leads) map.set(l.id, `${l.name} (${l.phone})`);
    return (id: string) => map.get(id) ?? id;
  }, [leads]);

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListCallSchedulesCallSchedulesGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: CallScheduleResponse) => {
    setEditing(item);
    setForm({
      lead_id: item.lead_id,
      scheduled_by: str(item.scheduled_by),
      scheduled_time: toISTLocalInput(item.scheduled_time as unknown as string),
      reminder_sent: item.reminder_sent ?? false,
      status: str(item.status) || "Pending",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lead_id) {
      toast.error("Pick a lead first.");
      return;
    }
    const payload = {
      lead_id: form.lead_id,
      scheduled_by: form.scheduled_by || null,
      scheduled_time: fromISTLocalInput(form.scheduled_time),
      reminder_sent: form.reminder_sent,
      status: form.status || null,
    };

    if (editing) {
      updateMutation.mutate(
        { callScheduleId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Call schedule updated");
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
              toast.success("Call schedule created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: CallScheduleResponse) => {
    if (!confirm(`Delete this call schedule for "${leadLabel(item.lead_id)}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { callScheduleId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Call schedule deleted");
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
          <h1 className="text-xl font-semibold">Call Schedules</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          </p>
        </div>
        {canWrite(role) && (
          <Button onClick={openCreate} disabled={leads.length === 0}>
            New call schedule
          </Button>
        )}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load call schedules.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Scheduled time (IST)</TableHead>
              <TableHead>Scheduled by</TableHead>
              <TableHead>Reminder sent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{leadLabel(item.lead_id)}</TableCell>
                <TableCell>
                  {toISTLocalInput(item.scheduled_time as unknown as string).replace("T", " ") || "-"}
                </TableCell>
                <TableCell>{item.scheduled_by ?? "-"}</TableCell>
                <TableCell>{item.reminder_sent ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.status ?? "Pending"}</Badge>
                </TableCell>
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
                  No call schedules yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit call schedule" : "New call schedule"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead_id">Lead *</Label>
              <Select
                value={form.lead_id}
                onValueChange={(v) => setForm({ ...form, lead_id: v })}
                disabled={!!editing}
              >
                <SelectTrigger id="lead_id">
                  <SelectValue placeholder="Select a lead" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_time">Scheduled time (IST)</Label>
              <Input
                id="scheduled_time"
                type="datetime-local"
                value={form.scheduled_time}
                onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="scheduled_by">Scheduled by</Label>
                <Input
                  id="scheduled_by"
                  value={form.scheduled_by}
                  onChange={(e) => setForm({ ...form, scheduled_by: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Input
                  id="status"
                  placeholder="Pending"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="reminder_sent"
                checked={form.reminder_sent}
                onCheckedChange={(c) => setForm({ ...form, reminder_sent: c === true })}
              />
              <Label htmlFor="reminder_sent">Reminder sent</Label>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? "Save changes" : "Create call schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
