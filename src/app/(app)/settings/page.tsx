"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListSettingsSettingsGet,
  useCreateSettingSettingsPost,
  useUpdateSettingSettingsSettingIdPatch,
  useDeleteSettingSettingsSettingIdDelete,
  getListSettingsSettingsGetQueryKey,
} from "@/lib/api-client/generated";
import type { SettingResponse } from "@/lib/api-client/generated/models";
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

// Mirrors app/models/settings.py's SettingBase exactly. (category, key) is
// UNIQUE in the DB - a duplicate pair surfaces as a normal 400 from the
// backend rather than being pre-validated here. Same soft-delete pattern
// as document_types/lookup_values: "Delete" sets is_active=false and the
// row drops out of the (active-only) list rather than being removed.
type SettingFormValues = {
  category: string;
  key: string;
  value: string;
  is_active: boolean;
};

const emptyForm: SettingFormValues = {
  category: "",
  key: "",
  value: "",
  is_active: true,
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SettingResponse | null>(null);
  const [form, setForm] = useState<SettingFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListSettingsSettingsGet({ limit: 100, offset: 0 });
  const createMutation = useCreateSettingSettingsPost();
  const updateMutation = useUpdateSettingSettingsSettingIdPatch();
  const deleteMutation = useDeleteSettingSettingsSettingIdDelete();

  const items: SettingResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListSettingsSettingsGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: SettingResponse) => {
    setEditing(item);
    setForm({
      category: item.category,
      key: item.key,
      value: item.value,
      is_active: item.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      category: form.category,
      key: form.key,
      value: form.value,
      is_active: form.is_active,
    };

    if (editing) {
      updateMutation.mutate(
        { settingId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Setting updated");
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
              toast.success("Setting created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: SettingResponse) => {
    if (!confirm(`Deactivate setting "${item.category}.${item.key}"? It will stop showing in this list.`)) return;
    deleteMutation.mutate(
      { settingId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Setting deactivated");
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
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} active
            {" · "}deleting deactivates a setting rather than removing it
          </p>
        </div>
        {canWrite(role) && <Button onClick={openCreate}>New setting</Button>}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load settings.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.category}</TableCell>
                <TableCell>{item.key}</TableCell>
                <TableCell className="max-w-xs truncate">{item.value}</TableCell>
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
                  No settings yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit setting" : "New setting"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                required
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
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
                {editing ? "Save changes" : "Create setting"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
