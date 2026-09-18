"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListApplicantsApplicantsGet,
  useCreateApplicantApplicantsPost,
  getListApplicantsApplicantsGetQueryKey,
} from "@/lib/api-client/generated";
import type { ApplicantResponse } from "@/lib/api-client/generated/models";
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
import { readClientSession, canWrite } from "@/lib/session";

// Minimal create form for this checkpoint - the applicants table has ~50
// columns (admissions paperwork fields); full multi-section form is a
// Phase A follow-up once the Leads pattern is confirmed working end-to-end.
type MinimalForm = { first_name: string; last_name: string; phone: string };
const emptyForm: MinimalForm = { first_name: "", last_name: "", phone: "" };

export default function ApplicantsPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<MinimalForm>(emptyForm);

  useEffect(() => {
    // Cookie read is client-only (SSR has no `document`); deliberately
    // deferred to after mount so server and first client render match,
    // rather than reading it in a lazy useState initializer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListApplicantsApplicantsGet({ limit: 50, offset: 0 });
  const createMutation = useCreateApplicantApplicantsPost();

  const applicants: ApplicantResponse[] =
    listQuery.data?.status === 200 ? listQuery.data.data.items : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      { data: form },
      {
        onSuccess: (res) => {
          if (res.status === 201) {
            toast.success("Applicant created");
            setDialogOpen(false);
            setForm(emptyForm);
            queryClient.invalidateQueries({
              queryKey: getListApplicantsApplicantsGetQueryKey({ limit: 50, offset: 0 }),
            });
          }
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Applicants</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          </p>
        </div>
        {canWrite(role) && (
          <Button onClick={() => setDialogOpen(true)}>New applicant</Button>
        )}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load applicants.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Reg. no.</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applicants.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  {a.first_name} {a.last_name}
                </TableCell>
                <TableCell>{a.phone}</TableCell>
                <TableCell>{a.reg_number ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{a.priority ?? "Normal"}</Badge>
                </TableCell>
                <TableCell>{a.status ?? "-"}</TableCell>
              </TableRow>
            ))}
            {applicants.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No applicants yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New applicant</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                required
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
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
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending}>
                Create applicant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
