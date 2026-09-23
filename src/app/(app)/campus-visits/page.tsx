"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListCampusVisitsCampusVisitsGet,
  useCreateCampusVisitCampusVisitsPost,
  useUpdateCampusVisitCampusVisitsCampusVisitIdPatch,
  useDeleteCampusVisitCampusVisitsCampusVisitIdDelete,
  getListCampusVisitsCampusVisitsGetQueryKey,
} from "@/lib/api-client/generated";
import { useAllLeads } from "@/lib/hooks/use-all-leads";
import type { CampusVisitResponse } from "@/lib/api-client/generated/models";
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

// Mirrors app/models/campus_visits.py's CampusVisitBase exactly.
// visited_by is plain text (not a FK to users) matching the live schema.
type CampusVisitFormValues = {
  lead_id: string;
  visit_date: string;
  visited_by: string;
  departments_seen: string;
  outcome: string;
  notes: string;
};

const emptyForm: CampusVisitFormValues = {
  lead_id: "",
  visit_date: "",
  visited_by: "",
  departments_seen: "",
  outcome: "",
  notes: "",
};

const str = (v: string | null | undefined) => v ?? "";

export default function CampusVisitsPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CampusVisitResponse | null>(null);
  const [form, setForm] = useState<CampusVisitFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListCampusVisitsCampusVisitsGet({ limit: 100, offset: 0 });
  const leadsQuery = useAllLeads();
  const createMutation = useCreateCampusVisitCampusVisitsPost();
  const updateMutation = useUpdateCampusVisitCampusVisitsCampusVisitIdPatch();
  const deleteMutation = useDeleteCampusVisitCampusVisitsCampusVisitIdDelete();

  const items: CampusVisitResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];
  const leads = useMemo(
    () => (leadsQuery.data ?? []),
    [leadsQuery.data]
  );
  const leadLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of leads) map.set(l.id, `${l.name} (${l.phone})`);
    return (id: string) => map.get(id) ?? id;
  }, [leads]);

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListCampusVisitsCampusVisitsGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: CampusVisitResponse) => {
    setEditing(item);
    setForm({
      lead_id: item.lead_id,
      visit_date: str(item.visit_date as unknown as string),
      visited_by: str(item.visited_by),
      departments_seen: str(item.departments_seen),
      outcome: str(item.outcome),
      notes: str(item.notes),
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
      visit_date: form.visit_date || null,
      visited_by: form.visited_by || null,
      departments_seen: form.departments_seen || null,
      outcome: form.outcome || null,
      notes: form.notes || null,
    };

    if (editing) {
      updateMutation.mutate(
        { campusVisitId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Campus visit updated");
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
              toast.success("Campus visit created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: CampusVisitResponse) => {
    if (!confirm(`Delete this campus visit for "${leadLabel(item.lead_id)}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { campusVisitId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Campus visit deleted");
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
          <h1 className="text-xl font-semibold">Campus Visits</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          </p>
        </div>
        {canWrite(role) && (
          <Button onClick={openCreate} disabled={leads.length === 0}>
            New campus visit
          </Button>
        )}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load campus visits.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Visit date</TableHead>
              <TableHead>Visited by</TableHead>
              <TableHead>Departments seen</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{leadLabel(item.lead_id)}</TableCell>
                <TableCell>{item.visit_date ?? "-"}</TableCell>
                <TableCell>{item.visited_by ?? "-"}</TableCell>
                <TableCell>{item.departments_seen ?? "-"}</TableCell>
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
                  No campus visits yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit campus visit" : "New campus visit"}</DialogTitle>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="visit_date">Visit date</Label>
                <Input
                  id="visit_date"
                  type="date"
                  value={form.visit_date}
                  onChange={(e) => setForm({ ...form, visit_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visited_by">Visited by</Label>
                <Input
                  id="visited_by"
                  value={form.visited_by}
                  onChange={(e) => setForm({ ...form, visited_by: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="departments_seen">Departments seen</Label>
              <Input
                id="departments_seen"
                value={form.departments_seen}
                onChange={(e) => setForm({ ...form, departments_seen: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outcome">Outcome</Label>
              <Input
                id="outcome"
                value={form.outcome}
                onChange={(e) => setForm({ ...form, outcome: e.target.value })}
              />
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
                {editing ? "Save changes" : "Create campus visit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
