import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Upload, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVITY_TYPES, METHODS, STATUSES, Activity, isoDate } from "@/lib/claimtrail";
import { useEvidence, useUploadEvidence, useDeleteEvidence, useSaveActivity, getEvidenceSignedUrl } from "@/hooks/useClaimTrail";
import { toast } from "sonner";

type Props = { initial?: Activity; onSaved?: () => void };

const schema = z.object({
  date: z.string().min(1, "Date required"),
  activity_type: z.string().min(1, "Activity type required"),
  company_name: z.string().trim().max(200).optional().nullable(),
  job_title: z.string().trim().max(200).optional().nullable(),
  job_url: z.string().trim().max(500).optional().nullable().refine((v) => !v || /^https?:\/\//i.test(v), "Must start with http(s)://"),
  contact_name: z.string().trim().max(200).optional().nullable(),
  contact_email: z.string().trim().max(255).optional().nullable().refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Invalid email"),
  contact_phone: z.string().trim().max(40).optional().nullable(),
  method: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export default function ActivityForm({ initial, onSaved }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Partial<Activity>>(
    initial ?? {
      date: isoDate(new Date()),
      activity_type: "Job application",
      method: "LinkedIn",
      status: "Applied",
    }
  );
  const save = useSaveActivity();
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  const evidence = useEvidence(savedId ?? undefined);
  const upload = useUploadEvidence();
  const del = useDeleteEvidence();

  const set = <K extends keyof Activity>(k: K, v: Activity[K] | null) => setForm((f) => ({ ...f, [k]: v as any }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const result = await save.mutateAsync({ ...form, id: savedId ?? undefined });
    setSavedId(result.id);
    if (onSaved) onSaved();
    else if (!initial) navigate("/log");
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!savedId) {
      toast.error("Save the activity first to attach evidence");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large (max 20MB)");
      return;
    }
    await upload.mutateAsync({ activityId: savedId, file });
    e.target.value = "";
  };

  const openFile = async (path: string) => {
    const url = await getEvidenceSignedUrl(path);
    window.open(url, "_blank", "noopener");
  };

  const dateObj = form.date ? new Date(form.date + "T00:00:00") : undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className={cn("w-full justify-start font-normal", !dateObj && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateObj ? format(dateObj, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateObj} onSelect={(d) => d && set("date", isoDate(d))} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label>Activity type</Label>
          <Select value={form.activity_type} onValueChange={(v) => set("activity_type", v)}>
            <SelectTrigger><SelectValue placeholder="Choose type" /></SelectTrigger>
            <SelectContent>{ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Company / organization</Label>
          <Input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} placeholder="e.g. Acme Co." />
        </div>
        <div>
          <Label>Job title</Label>
          <Input value={form.job_title ?? ""} onChange={(e) => set("job_title", e.target.value)} placeholder="e.g. Software Engineer" />
        </div>
      </div>

      <div>
        <Label>Job URL</Label>
        <Input value={form.job_url ?? ""} onChange={(e) => set("job_url", e.target.value)} placeholder="https://…" />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <Label>Contact name</Label>
          <Input value={form.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
        </div>
        <div>
          <Label>Contact email</Label>
          <Input value={form.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} placeholder="name@company.com" />
        </div>
        <div>
          <Label>Contact phone</Label>
          <Input value={form.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Method</Label>
          <Select value={form.method ?? undefined} onValueChange={(v) => set("method", v)}>
            <SelectTrigger><SelectValue placeholder="Choose method" /></SelectTrigger>
            <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status ?? undefined} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue placeholder="Choose status" /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="What was discussed, next steps, etc." />
      </div>

      <div className="ct-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-semibold text-sm">Evidence</div>
            <div className="text-xs text-muted-foreground">Screenshots, PDFs, email proof, resume or cover letter versions</div>
          </div>
          <label className={cn("inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm cursor-pointer hover:bg-muted", !savedId && "opacity-50 cursor-not-allowed")}>
            <Upload className="h-4 w-4" /> Upload
            <input type="file" className="hidden" onChange={onUpload} disabled={!savedId} accept="image/*,.pdf,.eml,.msg,.doc,.docx,.txt" />
          </label>
        </div>
        {!savedId && <p className="text-xs text-muted-foreground">Save the activity first to attach files.</p>}
        {savedId && evidence.data && evidence.data.length === 0 && (
          <p className="text-xs text-muted-foreground">No files yet.</p>
        )}
        <ul className="divide-y divide-border">
          {evidence.data?.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2 text-sm">
              <button type="button" onClick={() => openFile(f.storage_path)} className="flex items-center gap-2 text-left hover:underline">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="truncate max-w-[260px]">{f.file_name}</span>
              </button>
              <button type="button" onClick={() => del.mutate(f)} className="text-muted-foreground hover:text-destructive p-1">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={save.isPending} className="min-w-32">
          {save.isPending ? "Saving…" : savedId ? "Update" : "Save activity"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => (onSaved ? onSaved() : navigate(-1))}>Cancel</Button>
      </div>
    </form>
  );
}
