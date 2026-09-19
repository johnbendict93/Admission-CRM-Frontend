"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListHostelAllotmentsHostelAllotmentsGet,
  useCreateHostelAllotmentHostelAllotmentsPost,
  useUpdateHostelAllotmentHostelAllotmentsHostelAllotmentIdPatch,
  useDeleteHostelAllotmentHostelAllotmentsHostelAllotmentIdDelete,
  getListHostelAllotmentsHostelAllotmentsGetQueryKey,
  useListApplicantsApplicantsGet,
} from "@/lib/api-client/generated";
import type { HostelAllotmentResponse } from "@/lib/api-client/generated/models";
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

// Mirrors app/models/hostel_allotments.py's HostelAllotmentBase exactly.
// room_type/status are plain text (no Select) because the backend
// model's own comment confirms neither has a DB CHECK constraint.
type HostelAllotmentFormValues = {
  applicant_id: string;
  block_name: string;
  room_number: string;
  room_type: string;
  allotment_date: string;
  academic_year: string;
  status: string;
  remarks: string;
};

const emptyForm: HostelAllotmentFormValues = {
  applicant_id: "",
  block_name: "",
  room_number: "",
  room_type: "",
  allotment_date: "",
  academic_year: "",
  status: "",
  remarks: "",
};

const str = (v: string | null | undefined) => v ?? "";

export default function HostelAllotmentsPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HostelAllotmentResponse | null>(null);
  const [form, setForm] = useState<HostelAllotmentFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListHostelAllotmentsHostelAllotmentsGet({ limit: 100, offset: 0 });
  const applicantsQuery = useListApplicantsApplicantsGet({ limit: 200, offset: 0 });
  const createMutation = useCreateHostelAllotmentHostelAllotmentsPost();
  const updateMutation = useUpdateHostelAllotmentHostelAllotmentsHostelAllotmentIdPatch();
  const deleteMutation = useDeleteHostelAllotmentHostelAllotmentsHostelAllotmentIdDelete();

  const items: HostelAllotmentResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];
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

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListHostelAllotmentsHostelAllotmentsGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: HostelAllotmentResponse) => {
    setEditing(item);
    setForm({
      applicant_id: item.applicant_id,
      block_name: item.block_name,
      room_number: item.room_number,
      room_type: str(item.room_type),
      allotment_date: str(item.allotment_date as unknown as string),
      academic_year: str(item.academic_year),
      status: str(item.status),
      remarks: str(item.remarks),
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.applicant_id) {
      toast.error("Pick an applicant first.");
      return;
    }
    const payload = {
      applicant_id: form.applicant_id,
      block_name: form.block_name,
      room_number: form.room_number,
      room_type: form.room_type || null,
      allotment_date: form.allotment_date || null,
      academic_year: form.academic_year || null,
      status: form.status || null,
      remarks: form.remarks || null,
    };

    if (editing) {
      updateMutation.mutate(
        { hostelAllotmentId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Hostel allotment updated");
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
              toast.success("Hostel allotment created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: HostelAllotmentResponse) => {
    if (!confirm(`Delete hostel allotment "${item.block_name} / ${item.room_number}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { hostelAllotmentId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Hostel allotment deleted");
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
          <h1 className="text-xl font-semibold">Hostel Allotments</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          </p>
        </div>
        {canWrite(role) && (
          <Button onClick={openCreate} disabled={applicants.length === 0}>
            New allotment
          </Button>
        )}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load hostel allotments.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Block</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Room type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{applicantLabel(item.applicant_id)}</TableCell>
                <TableCell>{item.block_name}</TableCell>
                <TableCell>{item.room_number}</TableCell>
                <TableCell>{item.room_type ?? "Double"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.status ?? "Active"}</Badge>
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
                  No hostel allotments yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit hostel allotment" : "New hostel allotment"}</DialogTitle>
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
                <Label htmlFor="block_name">Block *</Label>
                <Input
                  id="block_name"
                  required
                  value={form.block_name}
                  onChange={(e) => setForm({ ...form, block_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room_number">Room number *</Label>
                <Input
                  id="room_number"
                  required
                  value={form.room_number}
                  onChange={(e) => setForm({ ...form, room_number: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="room_type">Room type</Label>
                <Input
                  id="room_type"
                  placeholder="Double"
                  value={form.room_type}
                  onChange={(e) => setForm({ ...form, room_type: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="allotment_date">Allotment date</Label>
                <Input
                  id="allotment_date"
                  type="date"
                  value={form.allotment_date}
                  onChange={(e) => setForm({ ...form, allotment_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="academic_year">Academic year</Label>
                <Input
                  id="academic_year"
                  placeholder="e.g. 2026-27"
                  value={form.academic_year}
                  onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Input
                  id="status"
                  placeholder="Active"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                rows={3}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? "Save changes" : "Create allotment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
