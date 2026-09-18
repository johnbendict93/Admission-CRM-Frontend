"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListLeadsLeadsGet,
  useCreateLeadLeadsPost,
  useUpdateLeadLeadsLeadIdPatch,
  useDeleteLeadLeadsLeadIdDelete,
  getListLeadsLeadsGetQueryKey,
} from "@/lib/api-client/generated";
import type { LeadResponse } from "@/lib/api-client/generated/models";
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

type LeadFormValues = {
  name: string;
  phone: string;
  email: string;
  school: string;
  course_interest: string;
  status: string;
};

const emptyForm: LeadFormValues = {
  name: "",
  phone: "",
  email: "",
  school: "",
  course_interest: "",
  status: "New",
};

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadResponse | null>(null);
  const [form, setForm] = useState<LeadFormValues>(emptyForm);

  useEffect(() => {
    // Cookie read is client-only (SSR has no `document`); deliberately
    // deferred to after mount so server and first client render match,
    // rather than reading it in a lazy useState initializer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListLeadsLeadsGet({ limit: 50, offset: 0 });
  const createMutation = useCreateLeadLeadsPost();
  const updateMutation = useUpdateLeadLeadsLeadIdPatch();
  const deleteMutation = useDeleteLeadLeadsLeadIdDelete();

  const leads: LeadResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: getListLeadsLeadsGetQueryKey({ limit: 50, offset: 0 }) });

  const openCreate = () => {
    setEditingLead(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (lead: LeadResponse) => {
    setEditingLead(lead);
    setForm({
      name: lead.name,
      phone: lead.phone,
      email: lead.email ?? "",
      school: lead.school ?? "",
      course_interest: lead.course_interest ?? "",
      status: lead.status ?? "New",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      school: form.school || null,
      course_interest: form.course_interest || null,
      status: form.status || null,
    };

    if (editingLead) {
      updateMutation.mutate(
        { leadId: editingLead.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Lead updated");
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
              toast.success("Lead created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (lead: LeadResponse) => {
    if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { leadId: lead.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Lead deleted");
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
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          </p>
        </div>
        {canWrite(role) && <Button onClick={openCreate}>New lead</Button>}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && (
        <p className="text-sm text-destructive">Failed to load leads.</p>
      )}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Course interest</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell>{lead.phone}</TableCell>
                <TableCell>{lead.course_interest ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{lead.status ?? "New"}</Badge>
                </TableCell>
                <TableCell>{lead.score ?? 0}</TableCell>
                <TableCell className="text-right space-x-2">
                  {canWrite(role) && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(lead)}>
                      Edit
                    </Button>
                  )}
                  {canDelete(role) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(lead)}
                    >
                      Delete
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No leads yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLead ? "Edit lead" : "New lead"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="school">School</Label>
              <Input
                id="school"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course_interest">Course interest</Label>
              <Input
                id="course_interest"
                value={form.course_interest}
                onChange={(e) => setForm({ ...form, course_interest: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingLead ? "Save changes" : "Create lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
