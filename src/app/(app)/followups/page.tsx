"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListFollowupsFollowupsGet,
  useCreateFollowupFollowupsPost,
  useUpdateFollowupFollowupsFollowupIdPatch,
  useDeleteFollowupFollowupsFollowupIdDelete,
  getListFollowupsFollowupsGetQueryKey,
  useGetCallSentimentMlFollowupsFollowupIdSentimentGet,
} from "@/lib/api-client/generated";
import { useAllLeads } from "@/lib/hooks/use-all-leads";
import type { FollowupResponse } from "@/lib/api-client/generated/models";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readClientSession, canWrite, canDelete } from "@/lib/session";

// Mirrors app/models/followups.py's FollowupBase exactly. This is the
// table the old Streamlit app (dce_crm) actively reads/writes today, so
// the shape here must match the live column types precisely rather than
// assuming anything nicer. call_time is a plain text column (NOT a native
// time type) per the model's own comment, so it's a free-text Input here,
// not <input type="time">. called_by is plain text (no FK to users).
type FollowupFormValues = {
  lead_id: string;
  called_by: string;
  call_date: string;
  call_time: string;
  response: string;
  notes: string;
  next_followup_date: string;
};

const emptyForm: FollowupFormValues = {
  lead_id: "",
  called_by: "",
  call_date: "",
  call_time: "",
  response: "",
  notes: "",
  next_followup_date: "",
};

const str = (v: string | null | undefined) => v ?? "";

export default function FollowupsPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FollowupResponse | null>(null);
  const [form, setForm] = useState<FollowupFormValues>(emptyForm);
  const [insightsItem, setInsightsItem] = useState<FollowupResponse | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(readClientSession()?.role);
  }, []);

  const listQuery = useListFollowupsFollowupsGet({ limit: 100, offset: 0 });
  const leadsQuery = useAllLeads();
  const createMutation = useCreateFollowupFollowupsPost();
  const updateMutation = useUpdateFollowupFollowupsFollowupIdPatch();
  const deleteMutation = useDeleteFollowupFollowupsFollowupIdDelete();

  // AI Insights dialog - module 19 call sentiment (app/routers/ml_call_sentiment.py,
  // keyed on followup_id, reads that followup's notes). Lazy: only fetched
  // for the one followup whose dialog is open, never per row.
  const sentimentQuery = useGetCallSentimentMlFollowupsFollowupIdSentimentGet(
    insightsItem?.id ?? "",
    { query: { enabled: insightsItem !== null } }
  );

  const items: FollowupResponse[] =
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
      queryKey: getListFollowupsFollowupsGetQueryKey({ limit: 100, offset: 0 }),
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: FollowupResponse) => {
    setEditing(item);
    setForm({
      lead_id: item.lead_id,
      called_by: str(item.called_by),
      call_date: str(item.call_date as unknown as string),
      call_time: str(item.call_time),
      response: str(item.response),
      notes: str(item.notes),
      next_followup_date: str(item.next_followup_date as unknown as string),
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
      called_by: form.called_by || null,
      call_date: form.call_date || null,
      call_time: form.call_time || null,
      response: form.response || null,
      notes: form.notes || null,
      next_followup_date: form.next_followup_date || null,
    };

    if (editing) {
      updateMutation.mutate(
        { followupId: editing.id, data: payload },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success("Followup updated");
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
              toast.success("Followup created");
              setDialogOpen(false);
              invalidateList();
            }
          },
        }
      );
    }
  };

  const handleDelete = (item: FollowupResponse) => {
    if (!confirm(`Delete this followup for "${leadLabel(item.lead_id)}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { followupId: item.id },
      {
        onSuccess: (res) => {
          if (res.status === 204) {
            toast.success("Followup deleted");
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
          <h1 className="text-xl font-semibold">Followups</h1>
          <p className="text-sm text-muted-foreground">
            {listQuery.data?.status === 200 ? listQuery.data.data.total : "..."} total
          </p>
        </div>
        {canWrite(role) && (
          <Button onClick={openCreate} disabled={leads.length === 0}>
            New followup
          </Button>
        )}
      </div>

      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {listQuery.isError && <p className="text-sm text-destructive">Failed to load followups.</p>}

      {listQuery.data?.status === 200 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Call date</TableHead>
              <TableHead>Call time</TableHead>
              <TableHead>Called by</TableHead>
              <TableHead>Response</TableHead>
              <TableHead>Next followup</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{leadLabel(item.lead_id)}</TableCell>
                <TableCell>{item.call_date ?? "-"}</TableCell>
                <TableCell>{item.call_time ?? "-"}</TableCell>
                <TableCell>{item.called_by ?? "-"}</TableCell>
                <TableCell>{item.response ?? "-"}</TableCell>
                <TableCell>{item.next_followup_date ?? "-"}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setInsightsItem(item)}>
                    AI Insights
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
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No followups yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit followup" : "New followup"}</DialogTitle>
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
                <Label htmlFor="call_date">Call date</Label>
                <Input
                  id="call_date"
                  type="date"
                  value={form.call_date}
                  onChange={(e) => setForm({ ...form, call_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="call_time">Call time</Label>
                <Input
                  id="call_time"
                  placeholder="e.g. 3:30 PM"
                  value={form.call_time}
                  onChange={(e) => setForm({ ...form, call_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="called_by">Called by</Label>
              <Input
                id="called_by"
                value={form.called_by}
                onChange={(e) => setForm({ ...form, called_by: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="response">Response</Label>
              <Input
                id="response"
                value={form.response}
                onChange={(e) => setForm({ ...form, response: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="next_followup_date">Next followup date</Label>
              <Input
                id="next_followup_date"
                type="date"
                value={form.next_followup_date}
                onChange={(e) => setForm({ ...form, next_followup_date: e.target.value })}
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
                {editing ? "Save changes" : "Create followup"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={insightsItem !== null} onOpenChange={(open) => !open && setInsightsItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              AI Insights{insightsItem ? ` \u2013 ${leadLabel(insightsItem.lead_id)}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {"Predictions from ML models trained on sample data \u2014 treat as a guide, not a guarantee."}
            </p>

            <div className="space-y-2">
              <p className="text-sm font-medium">Call sentiment</p>
              {sentimentQuery.isLoading && (
                <p className="text-sm text-muted-foreground">Loading...</p>
              )}
              {sentimentQuery.data?.status === 200 && (
                <>
                  {sentimentQuery.data.data.notes.trim() === "" ? (
                    <p className="text-sm text-muted-foreground">
                      This followup has no call notes, so there&apos;s nothing to analyse.
                    </p>
                  ) : (
                    <>
                      <Badge
                        className="capitalize"
                        variant={
                          sentimentQuery.data.data.predicted_sentiment === "negative"
                            ? "destructive"
                            : sentimentQuery.data.data.predicted_sentiment === "positive"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {sentimentQuery.data.data.predicted_sentiment}
                      </Badge>
                      <ul className="text-sm space-y-0.5">
                        {[...sentimentQuery.data.data.scores]
                          .sort((a, b) => b.probability - a.probability)
                          .map((sc) => (
                            <li key={sc.label} className="flex justify-between max-w-xs">
                              <span className="capitalize">{sc.label}</span>
                              <span className="text-muted-foreground">
                                {(sc.probability * 100).toFixed(0)}%
                              </span>
                            </li>
                          ))}
                      </ul>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {`Notes: \u201c${sentimentQuery.data.data.notes}\u201d`}
                      </p>
                    </>
                  )}
                </>
              )}
              {((sentimentQuery.data && sentimentQuery.data.status !== 200) ||
                sentimentQuery.isError) && (
                <p className="text-sm text-muted-foreground">Not available.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
