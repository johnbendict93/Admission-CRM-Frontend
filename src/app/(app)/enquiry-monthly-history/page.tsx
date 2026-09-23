"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListEnquiryMonthlyHistoryEnquiryMonthlyHistoryGet,
  useCreateEnquiryMonthlyHistoryEnquiryMonthlyHistoryPost,
  useUpdateEnquiryMonthlyHistoryEnquiryMonthlyHistoryRowIdPatch,
  useDeleteEnquiryMonthlyHistoryEnquiryMonthlyHistoryRowIdDelete,
  getListEnquiryMonthlyHistoryEnquiryMonthlyHistoryGetQueryKey,
} from "@/lib/api-client/generated";
import type { EnquiryMonthlyHistoryResponse } from "@/lib/api-client/generated/models";
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
import { readClientSession, canWrite, canDelete } from "@/lib/session";

// Mirrors app/models/enquiry_monthly_history.py's EnquiryMonthlyHistoryBase
// exactly. One row per (year, month) - the backend enforces this with a
// DB UNIQUE constraint, so a duplicate create comes back as a plain 400
// which the shared api-mutator.ts toast already surfaces (see that
// file's comment) - no special handling needed here, same as every other
// module's error path. Feeds module 20 (Demand Forecaster); "source"
// distinguishes real aggregated history from the illustrative synthetic
// rows seeded before a customer has real usage.
type EnquiryMonthlyHistoryFormValues = {
  year: string;
  month: string;
  enquiry_count: string;
  source: string;
};

const emptyForm: EnquiryMonthlyHistoryFormValues = {
  year: String(new Date().getFullYear()),
  month: "",
  enquiry_count: "",
  source: "",
};

const str = (v: string | null | undefined) => v ?? "";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function EnquiryMonthlyHistoryPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EnquiryMonthlyHistoryResponse | null>(null);
  const [form, setForm] = useState<EnquiryMonthlyHistoryFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListEnquiryMonthlyHistoryEnquiryMonthlyHistoryGet({ limit: 100, offset: 0 });
  const createMutation = useCreateEnquiryMonthlyHistoryEnquiryMonthlyHistoryPost();
  const updateMutation = useUpdateEnquiryMonthlyHistoryEnquiryMonthlyHistoryRowIdPatch();
  const deleteMutation = useDeleteEnquiryMonthlyHistoryEnquiryMonthlyHistoryRowIdDelete();

  const items: EnquiryMonthlyHistoryResponse[] = useMemo(() => {
    const rows = listQuery.data?.status === 200 ? listQuery.data.data.items : [];
    // Newest first, same ordering feel as the ML Demand Forecast chart will need.
    return [...rows].sort((a, b) => (b.year - a.year) || (b.month - a.month));
  }, [listQuery.data]);

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListEnquiryMonthlyHistoryEnquiryMonthlyHistoryGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: EnquiryMonthlyHistoryResponse) => {
    setEditing(item);
    setForm({
      year: String(item.year),
      month: String(item.month),
      enquiry_count: String(item.enquiry_count),
      source: str(item.source),
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const monthNum = Number(form.month);
    if (!monthNum || monthNum < 1 || monthNum > 12) {
      toast.error("Month must be between 1 and 12.");
      return;
    }
    const payload = {
      year: Number(form.year),
      month: monthNum,
      enquiry_count: form.enquiry_count ? Number(form.enquiry_count) : 0,
      source: form.source || null,
    };

    if (editing) {
      updateMutation.mutate(
        { rowId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Row updated");
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
              toast.success("Row created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: EnquiryMonthlyHistoryResponse) => {
    if (!confirm(`Delete the ${MONTH_NAMES[item.month - 1]} ${item.year} row? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { rowId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Row deleted");
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
          <h1 className="text-xl font-semibold">Enquiry Monthly History</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} rows ·{" "}
            one per year/month, feeds the Demand Forecast ML model
          </p>
        </div>
        {canWrite(role) && <Button onClick={openCreate}>New row</Button>}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load enquiry history.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Year</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Enquiry count</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.year}</TableCell>
                <TableCell>{MONTH_NAMES[item.month - 1] ?? item.month}</TableCell>
                <TableCell>{item.enquiry_count}</TableCell>
                <TableCell>
                  <Badge variant={item.source === "synthetic" ? "secondary" : "default"}>
                    {item.source ?? "-"}
                  </Badge>
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
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No history rows yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit row" : "New row"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="year">Year *</Label>
                <Input
                  id="year"
                  type="number"
                  required
                  disabled={!!editing}
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="month">Month (1-12) *</Label>
                <Input
                  id="month"
                  type="number"
                  min={1}
                  max={12}
                  required
                  disabled={!!editing}
                  value={form.month}
                  onChange={(e) => setForm({ ...form, month: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enquiry_count">Enquiry count *</Label>
              <Input
                id="enquiry_count"
                type="number"
                required
                value={form.enquiry_count}
                onChange={(e) => setForm({ ...form, enquiry_count: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                placeholder="e.g. synthetic, real"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? "Save changes" : "Create row"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
