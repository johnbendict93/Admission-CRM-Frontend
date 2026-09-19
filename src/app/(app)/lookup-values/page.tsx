"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListLookupValuesLookupValuesGet,
  useCreateLookupValueLookupValuesPost,
  useUpdateLookupValueLookupValuesLookupValueIdPatch,
  useDeleteLookupValueLookupValuesLookupValueIdDelete,
  getListLookupValuesLookupValuesGetQueryKey,
} from "@/lib/api-client/generated";
import type { LookupValueResponse } from "@/lib/api-client/generated/models";
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
import { Checkbox } from "@/components/ui/checkbox";
import { readClientSession, canWrite, canDelete } from "@/lib/session";

// Mirrors app/models/lookup_values.py's LookupValueBase exactly. (type,
// value) is UNIQUE in the DB - a duplicate pair surfaces as a normal 400
// from the backend rather than being pre-validated here. "type" is left
// as free text rather than a select: it's the very thing that DEFINES the
// dropdown values other modules would draw from (e.g. a "category" or
// "religion" lookup type), so there is no fixed list of types to offer -
// unlike Applications.programme, which is itself a real DB CHECK
// constraint. Same soft-delete pattern as document_types/settings.
type LookupValueFormValues = {
  type: string;
  value: string;
  sort_order: string;
  is_active: boolean;
};

const emptyForm: LookupValueFormValues = {
  type: "",
  value: "",
  sort_order: "0",
  is_active: true,
};

export default function LookupValuesPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LookupValueResponse | null>(null);
  const [form, setForm] = useState<LookupValueFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListLookupValuesLookupValuesGet({ limit: 200, offset: 0 });
  const createMutation = useCreateLookupValueLookupValuesPost();
  const updateMutation = useUpdateLookupValueLookupValuesLookupValueIdPatch();
  const deleteMutation = useDeleteLookupValueLookupValuesLookupValueIdDelete();

  const items: LookupValueResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListLookupValuesLookupValuesGetQueryKey({ limit: 200, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: LookupValueResponse) => {
    setEditing(item);
    setForm({
      type: item.type,
      value: item.value,
      sort_order: String(item.sort_order ?? 0),
      is_active: item.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      type: form.type,
      value: form.value,
      sort_order: form.sort_order ? Number(form.sort_order) : 0,
      is_active: form.is_active,
    };

    if (editing) {
      updateMutation.mutate(
        { lookupValueId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Lookup value updated");
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
              toast.success("Lookup value created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: LookupValueResponse) => {
    if (!confirm(`Deactivate lookup value "${item.type}: ${item.value}"? It will stop showing in this list.`)) return;
    deleteMutation.mutate(
      { lookupValueId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Lookup value deactivated");
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
          <h1 className="text-xl font-semibold">Lookup Values</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} active
            {" · "}deleting deactivates a value rather than removing it
          </p>
        </div>
        {canWrite(role) && <Button onClick={openCreate}>New lookup value</Button>}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load lookup values.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Sort order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.type}</TableCell>
                <TableCell>{item.value}</TableCell>
                <TableCell>{item.sort_order ?? 0}</TableCell>
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
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No lookup values yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit lookup value" : "New lookup value"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Input
                id="type"
                required
                placeholder="e.g. category, religion, community"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="value">Value</Label>
              <Input
                id="value"
                required
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sort_order">Sort order</Label>
              <Input
                id="sort_order"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(c) => setForm({ ...form, is_active: c === true })}
                />
                <Label htmlFor="is_active">Active (uncheck to deactivate, same as Delete)</Label>
              </div>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? "Save changes" : "Create lookup value"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
