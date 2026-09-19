"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListDocumentTypesDocumentTypesGet,
  useCreateDocumentTypeDocumentTypesPost,
  useUpdateDocumentTypeDocumentTypesDocumentTypeIdPatch,
  useDeleteDocumentTypeDocumentTypesDocumentTypeIdDelete,
  getListDocumentTypesDocumentTypesGetQueryKey,
} from "@/lib/api-client/generated";
import type { DocumentTypeResponse } from "@/lib/api-client/generated/models";
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

// Mirrors app/models/document_types.py's DocumentTypeBase exactly. Note
// from that model's own comments: there's no created_at column on this
// table, and "delete" here is really a soft deactivate (is_active set to
// false; the row is preserved) - the backend's own delete_document_type()
// docstring confirms this. The list endpoint excludes inactive rows, so a
// "deleted" type simply stops appearing here rather than being gone for
// good; is_active is left editable on the edit form so one can be
// reactivated by flipping it back on directly (there's no separate
// "restore" endpoint).
type DocumentTypeFormValues = {
  name: string;
  is_required: boolean;
  sort_order: string;
  is_active: boolean;
};

const emptyForm: DocumentTypeFormValues = {
  name: "",
  is_required: true,
  sort_order: "0",
  is_active: true,
};

export default function DocumentTypesPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentTypeResponse | null>(null);
  const [form, setForm] = useState<DocumentTypeFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListDocumentTypesDocumentTypesGet({ limit: 100, offset: 0 });
  const createMutation = useCreateDocumentTypeDocumentTypesPost();
  const updateMutation = useUpdateDocumentTypeDocumentTypesDocumentTypeIdPatch();
  const deleteMutation = useDeleteDocumentTypeDocumentTypesDocumentTypeIdDelete();

  const items: DocumentTypeResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListDocumentTypesDocumentTypesGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: DocumentTypeResponse) => {
    setEditing(item);
    setForm({
      name: item.name,
      is_required: item.is_required ?? true,
      sort_order: String(item.sort_order ?? 0),
      is_active: item.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      is_required: form.is_required,
      sort_order: form.sort_order ? Number(form.sort_order) : 0,
      is_active: form.is_active,
    };

    if (editing) {
      updateMutation.mutate(
        { documentTypeId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Document type updated");
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
              toast.success("Document type created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: DocumentTypeResponse) => {
    if (!confirm(`Deactivate document type "${item.name}"? It will stop showing in this list.`)) return;
    deleteMutation.mutate(
      { documentTypeId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Document type deactivated");
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
          <h1 className="text-xl font-semibold">Document Types</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} active
            {" · "}deleting deactivates a type rather than removing it
          </p>
        </div>
        {canWrite(role) && <Button onClick={openCreate}>New document type</Button>}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load document types.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Sort order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <Badge variant={item.is_required ? "default" : "secondary"}>
                    {item.is_required ? "Required" : "Optional"}
                  </Badge>
                </TableCell>
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
                  No document types yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit document type" : "New document type"}</DialogTitle>
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
              <Label htmlFor="sort_order">Sort order</Label>
              <Input
                id="sort_order"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_required"
                checked={form.is_required}
                onCheckedChange={(c) => setForm({ ...form, is_required: c === true })}
              />
              <Label htmlFor="is_required">Required</Label>
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
                {editing ? "Save changes" : "Create document type"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
