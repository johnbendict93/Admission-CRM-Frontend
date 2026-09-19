"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListFeePaymentsFeePaymentsGet,
  useCreateFeePaymentFeePaymentsPost,
  useUpdateFeePaymentFeePaymentsFeePaymentIdPatch,
  useDeleteFeePaymentFeePaymentsFeePaymentIdDelete,
  getListFeePaymentsFeePaymentsGetQueryKey,
  useListApplicantsApplicantsGet,
} from "@/lib/api-client/generated";
import type { FeePaymentResponse } from "@/lib/api-client/generated/models";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readClientSession, canWrite, canDelete } from "@/lib/session";

// Mirrors app/models/fee_payments.py's FeePaymentBase exactly. This is
// part of Phase A (the core admissions funnel, per the scoping doc) -
// built after Scholarships/Hostel Allotments/etc. in Phase C because it
// was missed in the original Phase A pass and only caught on review.
// fee_component/payment_mode are plain text (no Select) because the
// backend model's own comment confirms neither has a DB CHECK
// constraint - unlike applications.programme/allotted_seat_type.
type FeePaymentFormValues = {
  applicant_id: string;
  fee_component: string;
  amount: string;
  payment_mode: string;
  payment_date: string;
  receipt_no: string;
  academic_year: string;
  remarks: string;
};

const emptyForm: FeePaymentFormValues = {
  applicant_id: "",
  fee_component: "",
  amount: "",
  payment_mode: "",
  payment_date: "",
  receipt_no: "",
  academic_year: "",
  remarks: "",
};

const str = (v: string | null | undefined) => v ?? "";

export default function FeePaymentsPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeePaymentResponse | null>(null);
  const [form, setForm] = useState<FeePaymentFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListFeePaymentsFeePaymentsGet({ limit: 100, offset: 0 });
  const applicantsQuery = useListApplicantsApplicantsGet({ limit: 200, offset: 0 });
  const createMutation = useCreateFeePaymentFeePaymentsPost();
  const updateMutation = useUpdateFeePaymentFeePaymentsFeePaymentIdPatch();
  const deleteMutation = useDeleteFeePaymentFeePaymentsFeePaymentIdDelete();

  const items: FeePaymentResponse[] = useMemo(
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

  const totalCollected = useMemo(
    () => items.reduce((sum, item) => sum + (item.amount ?? 0), 0),
    [items]
  );

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListFeePaymentsFeePaymentsGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: FeePaymentResponse) => {
    setEditing(item);
    setForm({
      applicant_id: item.applicant_id,
      fee_component: item.fee_component,
      amount: item.amount != null ? String(item.amount) : "",
      payment_mode: item.payment_mode,
      payment_date: str(item.payment_date as unknown as string),
      receipt_no: str(item.receipt_no),
      academic_year: str(item.academic_year),
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
    if (!form.payment_mode) {
      toast.error("Payment mode is required.");
      return;
    }
    const payload = {
      applicant_id: form.applicant_id,
      fee_component: form.fee_component,
      amount: form.amount ? Number(form.amount) : 0,
      payment_mode: form.payment_mode,
      payment_date: form.payment_date || null,
      receipt_no: form.receipt_no || null,
      academic_year: form.academic_year || null,
      remarks: form.remarks || null,
    };

    if (editing) {
      updateMutation.mutate(
        { feePaymentId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Fee payment updated");
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
              toast.success("Fee payment recorded");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: FeePaymentResponse) => {
    if (!confirm(`Delete this fee payment (${item.fee_component}, ${item.amount}) for "${applicantLabel(item.applicant_id)}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { feePaymentId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Fee payment deleted");
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
          <h1 className="text-xl font-semibold">Fee Payments</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total ·{" "}
            {totalCollected.toLocaleString()} collected (this page)
          </p>
        </div>
        {canWrite(role) && (
          <Button onClick={openCreate} disabled={applicants.length === 0}>
            New payment
          </Button>
        )}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load fee payments.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Component</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Payment date</TableHead>
              <TableHead>Receipt no.</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{applicantLabel(item.applicant_id)}</TableCell>
                <TableCell>{item.fee_component}</TableCell>
                <TableCell>{item.amount}</TableCell>
                <TableCell>{item.payment_mode}</TableCell>
                <TableCell>{item.payment_date ?? "-"}</TableCell>
                <TableCell>{item.receipt_no ?? "-"}</TableCell>
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
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No fee payments yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit fee payment" : "New fee payment"}</DialogTitle>
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
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  required
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="payment_mode">Payment mode *</Label>
                <Input
                  id="payment_mode"
                  required
                  placeholder="e.g. Cash, UPI, Cheque"
                  value={form.payment_mode}
                  onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment_date">Payment date</Label>
                <Input
                  id="payment_date"
                  type="date"
                  value={form.payment_date}
                  onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="receipt_no">Receipt no.</Label>
                <Input
                  id="receipt_no"
                  value={form.receipt_no}
                  onChange={(e) => setForm({ ...form, receipt_no: e.target.value })}
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
                {editing ? "Save changes" : "Record payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
