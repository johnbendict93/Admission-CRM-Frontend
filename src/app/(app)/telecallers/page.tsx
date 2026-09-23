"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListTelecallersTelecallersGet,
  useCreateTelecallerTelecallersPost,
  useUpdateTelecallerTelecallersTelecallerIdPatch,
  useDeleteTelecallerTelecallersTelecallerIdDelete,
  getListTelecallersTelecallersGetQueryKey,
  useGetRankedLeadsMlTelecallersTelecallerNameRankedLeadsGet,
} from "@/lib/api-client/generated";
import type { TelecallerResponse } from "@/lib/api-client/generated/models";
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
import { readClientSession, canWrite, canDelete } from "@/lib/session";

// Mirrors app/models/telecallers.py's TelecallerBase exactly. No FKs, no
// CHECK constraints, and (unlike every other module so far) no
// created_at-only-no-updated_at asymmetry to account for beyond what's
// already reflected in TelecallerResponse.
type TelecallerFormValues = {
  name: string;
  email: string;
  phone: string;
  department: string;
  active: boolean;
};

const emptyForm: TelecallerFormValues = {
  name: "",
  email: "",
  phone: "",
  department: "",
  active: true,
};

const str = (v: string | null | undefined) => v ?? "";

export default function TelecallersPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TelecallerResponse | null>(null);
  const [form, setForm] = useState<TelecallerFormValues>(emptyForm);
  const [rankedFor, setRankedFor] = useState<TelecallerResponse | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListTelecallersTelecallersGet({ limit: 100, offset: 0 });
  const createMutation = useCreateTelecallerTelecallersPost();
  const updateMutation = useUpdateTelecallerTelecallersTelecallerIdPatch();
  const deleteMutation = useDeleteTelecallerTelecallersTelecallerIdDelete();

  // "Ranked leads" dialog - module 21 (app/routers/ml_lead_ranking.py).
  // Keyed by telecaller NAME, matched against leads.assigned_to (free text,
  // not an FK) - an unmatched name returns 200 with an empty list, not 404.
  // The generated URL builder doesn't encode the path segment, so encode
  // here in case a name contains "/", "#" or "?". Lazy: only fetched for
  // the telecaller whose dialog is open.
  const rankedQuery = useGetRankedLeadsMlTelecallersTelecallerNameRankedLeadsGet(
    rankedFor ? encodeURIComponent(rankedFor.name) : "",
    { query: { enabled: rankedFor !== null } }
  );

  const items: TelecallerResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListTelecallersTelecallersGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: TelecallerResponse) => {
    setEditing(item);
    setForm({
      name: item.name,
      email: str(item.email),
      phone: str(item.phone),
      department: str(item.department),
      active: item.active ?? true,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      department: form.department || null,
      active: form.active,
    };

    if (editing) {
      updateMutation.mutate(
        { telecallerId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Telecaller updated");
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
              toast.success("Telecaller created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: TelecallerResponse) => {
    if (!confirm(`Delete telecaller "${item.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { telecallerId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Telecaller deleted");
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
          <h1 className="text-xl font-semibold">Telecallers</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          </p>
        </div>
        {canWrite(role) && <Button onClick={openCreate}>New telecaller</Button>}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load telecallers.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.phone ?? "-"}</TableCell>
                <TableCell>{item.department ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={item.active ? "default" : "secondary"}>
                    {item.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setRankedFor(item)}>
                    Ranked leads
                  </Button>
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
                  No telecallers yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit telecaller" : "New telecaller"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="active"
                checked={form.active}
                onCheckedChange={(c) => setForm({ ...form, active: c === true })}
              />
              <Label htmlFor="active">Active</Label>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? "Save changes" : "Create telecaller"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={rankedFor !== null} onOpenChange={(open) => !open && setRankedFor(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Ranked leads{rankedFor ? ` \u2013 ${rankedFor.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {"Open leads assigned to this telecaller, most likely to convert first. Predictions from ML models trained on sample data \u2014 treat as a guide, not a guarantee."}
            </p>
            {rankedQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            {rankedQuery.data?.status === 200 && rankedQuery.data.data.ranked_leads.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No open leads are assigned to this name. (Matching uses the lead&apos;s
                &quot;assigned to&quot; text, so the spelling has to match exactly.)
              </p>
            )}
            {rankedQuery.data?.status === 200 && rankedQuery.data.data.ranked_leads.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">
                  {rankedQuery.data.data.lead_count} open leads
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Conversion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedQuery.data.data.ranked_leads.map((lead, i) => (
                      <TableRow key={lead.lead_id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{lead.name}</TableCell>
                        <TableCell>{lead.phone}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{lead.status ?? "New"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {(lead.predicted_conversion_probability * 100).toFixed(0)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            {((rankedQuery.data && rankedQuery.data.status !== 200) || rankedQuery.isError) && (
              <p className="text-sm text-muted-foreground">Not available.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
