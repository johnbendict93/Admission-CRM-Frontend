"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListScholarshipsScholarshipsGet,
  useCreateScholarshipScholarshipsPost,
  useUpdateScholarshipScholarshipsScholarshipIdPatch,
  useDeleteScholarshipScholarshipsScholarshipIdDelete,
  getListScholarshipsScholarshipsGetQueryKey,
  useListApplicantsApplicantsGet,
} from "@/lib/api-client/generated";
import type { ScholarshipResponse } from "@/lib/api-client/generated/models";
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

// Mirrors app/models/scholarships.py's ScholarshipBase exactly.
// scholarship_type and status are plain text below (no Select) because
// the backend model's own comment confirms neither has a DB CHECK
// constraint - unlike Applications.programme, which does.
type ScholarshipFormValues = {
  applicant_id: string;
  scholarship_type: string;
  amount: string;
  academic_year: string;
  status: string;
  reference_no: string;
  remarks: string;
};

const emptyForm: ScholarshipFormValues = {
  applicant_id: "",
  scholarship_type: "",
  amount: "",
  academic_year: "",
  status: "",
  reference_no: "",
  remarks: "",
};

const str = (v: string | null | undefined) => v ?? "";

export default function ScholarshipsPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScholarshipResponse | null>(null);
  const [form, setForm] = useState<ScholarshipFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListScholarshipsScholarshipsGet({ limit: 100, offset: 0 });
  const applicantsQuery = useListApplicantsApplicantsGet({ limit: 200, offset: 0 });
  const createMutation = useCreateScholarshipScholarshipsPost();
  const updateMutation = useUpdateScholarshipScholarshipsScholarshipIdPatch();
  const deleteMutation = useDeleteScholarshipScholarshipsScholarshipIdDelete();

  const items: ScholarshipResponse[] =
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
      queryKey: getListScholarshipsScholarshipsGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: ScholarshipResponse) => {
    setEditing(item);
    setForm({
      applicant_id: item.applicant_id,
      scholarship_type: item.scholarship_type,
      amount: item.amount != null ? String(item.amount) : "",
      academic_year: str(item.academic_year),
      status: str(item.status),
      reference_no: str(item.reference_no),
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
      scholarship_type: form.scholarship_type,
      amount: form.amount ? Number(form.amount) : null,
      academic_year: form.academic_year || null,
      status: form.status || null,
      reference_no: form.reference_no || null,
      remarks: form.remarks || null,
    };

    if (editing) {
      updateMutation.mutate(
        { scholarshipId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Scholarship updated");
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
              toast.success("Scholarship created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: ScholarshipResponse) => {
    if (!confirm(`Delete scholarship "${item.scholarship_type}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { scholarshipId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Scholarship deleted");
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
          <h1 className="text-xl font-semibold">Scholarships</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          </p>
        </div>
        {canWrite(role) && (
          <Button onClick={openCreate} disabled={applicants.length === 0}>
            New scholarship
          </Button>
        )}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load scholarships.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Academic year</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{applicantLabel(item.applicant_id)}</TableCell>
                <TableCell>{item.scholarship_type}</TableCell>
                <TableCell>{item.amount ?? 0}</TableCell>
                <TableCell>{item.academic_year ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.status ?? "Applied"}</Badge>
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
                  No scholarships yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit scholarship" : "New scholarship"}</DialogTitle>
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
                <Label htmlFor="scholarship_type">Type *</Label>
                <Input
                  id="scholarship_type"
                  required
                  value={form.scholarship_type}
                  onChange={(e) => setForm({ ...form, scholarship_type: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
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
                  placeholder="Applied"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference_no">Reference no.</Label>
              <Input
                id="reference_no"
                value={form.reference_no}
                onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
              />
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
                {editing ? "Save changes" : "Create scholarship"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
