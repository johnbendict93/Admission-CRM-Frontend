"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListFeeDueSchedulesFeeDueScheduleGet,
  useCreateFeeDueScheduleFeeDueSchedulePost,
  useUpdateFeeDueScheduleFeeDueScheduleFeeDueScheduleIdPatch,
  useDeleteFeeDueScheduleFeeDueScheduleFeeDueScheduleIdDelete,
  getListFeeDueSchedulesFeeDueScheduleGetQueryKey,
  useListApplicantsApplicantsGet,
} from "@/lib/api-client/generated";
import type { FeeDueScheduleResponse } from "@/lib/api-client/generated/models";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readClientSession, canWrite, canDelete } from "@/lib/session";

// Mirrors app/models/fee_due_schedule.py's FeeDueScheduleBase exactly.
// Same "money on an applicant" domain as Fee Payments (see that page's
// note) - this table is what's OWED and BY WHEN, added ahead of module 18
// (Fee Default Risk); Fee Payments is what's actually been PAID. No CHECK
// constraint on fee_component (plain text, same as Fee Payments).
type FeeDueScheduleFormValues = {
  applicant_id: string;
  fee_component: string;
  academic_year: string;
  amount_due: string;
  due_date: string;
};

const emptyForm: FeeDueScheduleFormValues = {
  applicant_id: "",
  fee_component: "",
  academic_year: "",
  amount_due: "",
  due_date: "",
};

const str = (v: string | null | undefined) => v ?? "";

export default function FeeDueSchedulePage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeeDueScheduleResponse | null>(null);
  const [form, setForm] = useState<FeeDueScheduleFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListFeeDueSchedulesFeeDueScheduleGet({ limit: 100, offset: 0 });
  const applicantsQuery = useListApplicantsApplicantsGet({ limit: 200, offset: 0 });
  const createMutation = useCreateFeeDueScheduleFeeDueSchedulePost();
  const updateMutation = useUpdateFeeDueScheduleFeeDueScheduleFeeDueScheduleIdPatch();
  const deleteMutation = useDeleteFeeDueScheduleFeeDueScheduleFeeDueScheduleIdDelete();

  const items: FeeDueScheduleResponse[] = useMemo(
    () => (listQuery.data?.status === 200 ? listQuery.data.data.items : []),
    [listQuery.data]
  );
  const applicants = useMemo(
    () => (applicantsQuery.data?.status === 200 ? applicantsQuery.data.data.items : []),
    [applicantsQuery.data]
  );
  const applicantLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of applicants) {
      map.set(a.id, `${a.first_name} ${a.last_name}${a.reg_number ? ` (${a.reg_number})` : ""}`);
    }
    return (id: string) => map.get(id) ?? id;
  }, [applicants]);

  const totalDue = useMemo(
    () => items.reduce((sum, item) => sum + (item.amount_due ?? 0), 0),
    [items]
  );

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListFeeDueSchedulesFeeDueScheduleGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: FeeDueScheduleResponse) => {
    setEditing(item);
    setForm({
      applicant_id: item.applicant_id,
      fee_component: item.fee_component,
      academic_year: str(item.academic_year),
      amount_due: item.amount_due != null ? String(item.amount_due) : "",
      due_date: str(item.due_date as unknown as string),
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.applicant_id) {
      toast.error("Pick an applicant first.");
      return;
    }
    if (!form.due_date) {
      toast.error("Due date is required.");
      return;
    }
    const payload = {
      applicant_id: form.applicant_id,
      fee_component: form.fee_component,
      academic_year: form.academic_year || null,
      amount_due: form.amount_due ? Number(form.amount_due) : 0,
      due_date: form.due_date,
    };

    if (editing) {
      updateMutation.mutate(
        { feeDueScheduleId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Fee due row updated");
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
              toast.success("Fee due row created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: FeeDueScheduleResponse) => {
    if (!confirm(`Delete this fee due row (${item.fee_component}, ${item.amount_due}) for "${applicantLabel(item.applicant_id)}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { feeDueScheduleId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Fee due row deleted");
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
          <h1 className="text-xl font-semibold">Fee Due Schedule</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total ·{" "}
            {totalDue.toLocaleString()} due (this page)
          </p>
        </div>
        {canWrite(role) && (
          <Button onClick={openCreate} disabled={applicants.length === 0}>
            New due row
          </Button>
        )}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load fee due schedule.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Component</TableHead>
              <TableHead>Amount due</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Academic year</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{applicantLabel(item.applicant_id)}</TableCell>
                <TableCell>{item.fee_component}</TableCell>
                <TableCell>{item.amount_due}</TableCell>
                <TableCell>{item.due_date ?? "-"}</TableCell>
                <TableCell>{item.academic_year ?? "-"}</TableCell>
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
                  No fee due rows yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit fee due row" : "New fee due row"}</DialogTitle>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fee_component">Fee component *</Label>
                <Input
                  id="fee_component"
                  required
                  placeholder="e.g. Tuition, Hostel"
                  value={form.fee_component}
                  onChange={(e) => setForm({ ...form, fee_component: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount_due">Amount due *</Label>
                <Input
                  id="amount_due"
                  type="number"
                  required
                  value={form.amount_due}
                  onChange={(e) => setForm({ ...form, amount_due: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="due_date">Due date *</Label>
                <Input
                  id="due_date"
                  type="date"
                  required
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="academic_year">Academic year</Label>
                <Input
                  id="academic_year"
                  placeholder="e.g. 2026-27"
                  value={form.academic_year}
                  onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? "Save changes" : "Create due row"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
