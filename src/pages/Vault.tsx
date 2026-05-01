import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActivities, useEvidence, getEvidenceSignedUrl } from "@/hooks/useClaimTrail";
import { useProfile } from "@/hooks/useClaimTrail";
import { Activity, ACTIVITY_TYPES, STATUSES, fmtDate, getWeekRange, isoDate, weekLabel } from "@/lib/claimtrail";
import { StatusBadge } from "@/components/Badges";
import { Download, FileText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportEvidenceZip } from "@/lib/exports";
import { toast } from "sonner";

export default function Vault() {
  const { data: profile } = useProfile();
  const startDay = profile?.week_start_day ?? 0;
  const { data: activities = [] } = useActivities();
  const { data: evidence = [] } = useEvidence();

  const [q, setQ] = useState("");
  const [week, setWeek] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [open, setOpen] = useState<Activity | null>(null);

  const weeks = useMemo(() => {
    const set = new Map<string, { start: string; end: string }>();
    activities.forEach((a) => {
      const { start, end } = getWeekRange(new Date(a.date + "T00:00:00"), startDay);
      set.set(isoDate(start), { start: isoDate(start), end: isoDate(end) });
    });
    return [...set.values()].sort((a, b) => (a.start < b.start ? 1 : -1));
  }, [activities, startDay]);

  const filtered = activities.filter((a) => {
    if (type !== "all" && a.activity_type !== type) return false;
    if (status !== "all" && a.status !== status) return false;
    if (week !== "all") {
      const w = weeks.find((w) => w.start === week);
      if (!w || a.date < w.start || a.date > w.end) return false;
    }
    if (q.trim()) {
      const hay = `${a.company_name ?? ""} ${a.job_title ?? ""} ${a.notes ?? ""} ${a.contact_name ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const evidenceByActivity = useMemo(() => {
    const m: Record<string, typeof evidence> = {};
    evidence.forEach((e) => { (m[e.activity_id] ??= []).push(e); });
    return m;
  }, [evidence]);

  const downloadWeekZip = async () => {
    if (week === "all") { toast.error("Pick a week first"); return; }
    const w = weeks.find((w) => w.start === week)!;
    const ids = filtered.map((a) => a.id);
    const ev = evidence.filter((e) => ids.includes(e.activity_id));
    if (ev.length === 0) { toast.error("No evidence files in this selection"); return; }
    toast.message("Building ZIP…");
    await exportEvidenceZip({ startDate: w.start, endDate: w.end, activities: filtered, evidence: ev });
    toast.success("ZIP downloaded");
  };

  const openFile = async (path: string) => {
    const url = await getEvidenceSignedUrl(path);
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl">Evidence vault</h1>
          <p className="text-sm text-muted-foreground mt-1">Search, filter, and download your proof.</p>
        </div>
        <Button onClick={downloadWeekZip} variant="outline">
          <Download className="h-4 w-4 mr-1.5" /> Download week as ZIP
        </Button>
      </header>

      <div className="ct-card p-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search company, role, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={week} onValueChange={setWeek}>
          <SelectTrigger><SelectValue placeholder="Week" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All weeks</SelectItem>
            {weeks.map((w) => <SelectItem key={w.start} value={w.start}>{weekLabel(w.start, w.end)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}

      <ul className="space-y-3">
        {filtered.map((a) => {
          const ev = evidenceByActivity[a.id] ?? [];
          return (
            <li key={a.id} className="ct-card p-4 cursor-pointer hover:border-primary/40 transition" onClick={() => setOpen(a)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{fmtDate(a.date)}</div>
                  <div className="font-semibold truncate">{a.company_name || "—"}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {a.activity_type}{a.job_title ? ` · ${a.job_title}` : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <StatusBadge status={a.status} />
                  <span className="text-xs text-muted-foreground">{ev.length} file{ev.length === 1 ? "" : "s"}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{open?.company_name || "Activity"}</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div><span className="text-foreground font-medium">Date:</span> {fmtDate(open.date)}</div>
                <div><span className="text-foreground font-medium">Type:</span> {open.activity_type}</div>
                <div><span className="text-foreground font-medium">Method:</span> {open.method ?? "—"}</div>
                <div><span className="text-foreground font-medium">Status:</span> {open.status ?? "—"}</div>
                <div className="col-span-2"><span className="text-foreground font-medium">Job:</span> {open.job_title ?? "—"}</div>
                {open.job_url && <div className="col-span-2 truncate"><a href={open.job_url} target="_blank" rel="noopener" className="text-primary-deep underline">{open.job_url}</a></div>}
                {open.contact_name && <div className="col-span-2"><span className="text-foreground font-medium">Contact:</span> {open.contact_name}{open.contact_email ? ` · ${open.contact_email}` : ""}</div>}
                {open.notes && <div className="col-span-2 whitespace-pre-wrap"><span className="text-foreground font-medium">Notes:</span> {open.notes}</div>}
              </div>
              <div>
                <div className="font-semibold mb-2">Evidence</div>
                {(evidenceByActivity[open.id] ?? []).length === 0 ? (
                  <p className="text-muted-foreground text-sm">No files attached.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(evidenceByActivity[open.id] ?? []).map((f) => (
                      <li key={f.id}>
                        <button onClick={() => openFile(f.storage_path)} className="flex items-center gap-2 text-left hover:underline">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{f.file_name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
