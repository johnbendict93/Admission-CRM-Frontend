"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListUsersUsersGet,
  useCreateUserUsersPost,
  getListUsersUsersGetQueryKey,
} from "@/lib/api-client/generated";
import type { UserResponse } from "@/lib/api-client/generated/models";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readClientSession } from "@/lib/session";

// Roles an admin may hand out. Mirrors CREATABLE_ROLES in the API's
// app/models/users.py (admin is deliberately absent: new admins are made
// directly in Supabase). The API re-validates this, so it is only a UI aid.
const CREATABLE_ROLES = ["counselor", "staff", "viewer"] as const;

type UserFormValues = {
  full_name: string;
  email: string;
  role: string;
  department: string;
  temporary_password: string;
};

const emptyForm: UserFormValues = {
  full_name: "",
  email: "",
  role: "counselor",
  department: "",
  temporary_password: "",
};

const LIST_PARAMS = { limit: 200, offset: 0 };

// Random 14-char password from an unambiguous alphabet (no 0/O/1/l/I).
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<UserFormValues>(emptyForm);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  // Only admins may create users. A non-admin who reaches this page must
  // never call the API: a 403 makes the shared handler sign them out.
  const isAdmin = role === "admin";

  const listQuery = useListUsersUsersGet(LIST_PARAMS);
  const createMutation = useCreateUserUsersPost();

  const items: UserResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      {
        data: {
          full_name: form.full_name,
          email: form.email,
          role: form.role,
          department: form.department.trim() || null,
          temporary_password: form.temporary_password,
        },
      },
      {
        onSuccess: (res) => {
          // Errors (409 duplicate email, 422 validation) are already toasted
          // by the shared api-mutator, so only the success path is handled here.
          if (res.status === 201) {
            toast.success(`User created: ${res.data.full_name}. Give them the temporary password.`);
            setDialogOpen(false);
            setForm(emptyForm);
            queryClient.invalidateQueries({ queryKey: getListUsersUsersGetQueryKey(LIST_PARAMS) });
          }
        },
      }
    );
  };

  if (role !== undefined && !isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">Only admins can manage users.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} active
            {" · "}new users get a temporary password you set here
          </p>
        </div>
        {isAdmin && <Button onClick={openCreate}>Add user</Button>}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load users.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell>{u.department ?? "-"}</TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                required
                maxLength={100}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="department">Department (optional)</Label>
              <Input
                id="department"
                maxLength={100}
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="temporary_password">Temporary password</Label>
              <div className="flex gap-2">
                <Input
                  id="temporary_password"
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  value={form.temporary_password}
                  onChange={(e) => setForm({ ...form, temporary_password: e.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm({ ...form, temporary_password: generatePassword() })}
                >
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                At least 8 characters. Shown as plain text so you can pass it to the person; they should change it after first login.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
