import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Trash2, Upload, FileSpreadsheet, FileDown, Search, Paperclip, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Activity, SHEET_COLUMNS, DEFAULT_NEW_ROW, isActivityComplete, isoDate, getWeekRange, weekLabel, missingFields, weekEndingFriday, fmtDate } from "@/lib/claimtrail";
import { useActivities, useDeleteActivity, useProfile, useSaveActivitySilent, useBulkInsertActivities, useEvidence, useUploadEvidence, useDeleteEvidence, getEvidenceSignedUrl } from "@/hooks/useClaimTrail";
import { exportActivitiesCSV } from "@/lib/exports";
import { exportXLSX, exportToNewGoogleSheet, appendToGoogleSheet, importFromGoogleSheet, parseSheetRows, dedupeAgainstExisting, readFileAsRows } from "@/lib/sheetIO";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type RowDraft = Partial<Activity> & { _localKey?: string };

const NEW_ROW_KEY = "__new__";

export default function SheetView() {
  const { data: profile } = useProfile();
  const { data: activities = [] } = useActivities();
  const save = useSaveActivitySilent();
  const del = useDeleteActivity();
  const bulk = useBulkInsertActivities();

  const [draftNew, setDraftNew] = useState<RowDraft>({ ...DEFAULT_NEW_ROW });
  const [drafts, setDrafts] = useState<Record<string, Partial<Activity>>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<Activity | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [sheetsDialog, setSheetsDialog] = useState<null | "import" | "append">(null);
  const [sheetsUrl, setSheetsUrl] = useState(() => {
    try { return localStorage.getItem("claimtrail.lastSheetsUrl") ?? ""; } catch { return ""; }
  });

  const debounceTimers = useRef<Record<string, number>>({});
  const enrichTimers = useRef<Record<string, number>>({});
  const enrichedKeys = useRef<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const goal = profile?.weekly_goal ?? 3;
  const startDay = profile?.week_start_day ?? 0;
  const { start, end } = getWeekRange(new Date(), startDay);
  const startISO = isoDate(start), endISO = isoDate(end);
  const thisWeek = activities.filter((a) => a.date >= startISO && a.date <= endISO);
  const completeThisWeek = thisWeek.filter((a) => a.is_complete).length;
  const ready = completeThisWeek >= goal;

  const filtered = useMemo(() => {
    const base = search.trim()
      ? activities.filter((a) => {
          const q = search.trim().toLowerCase();
          return [a.company_name, a.job_title, a.activity_type, a.method, a.contact_type, a.status, a.notes, a.contact_name, a.contact_email, a.employer_city]
            .some((v) => v && String(v).toLowerCase().includes(q));
        })
      : activities;
    // Sort ascending by contact date so the most recent row is at the bottom (just above the new-row).
    return [...base].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [activities, search]);

  // Auto-save with debounce
  const scheduleSave = (id: string, payload: Partial<Activity>) => {
    if (debounceTimers.current[id]) window.clearTimeout(debounceTimers.current[id]);
    debounceTimers.current[id] = window.setTimeout(async () => {
      const merged = { ...activities.find((a) => a.id === id), ...payload, id };
      if (!merged.date || !merged.activity_type || !merged.company_name?.trim()) return;
      setSavingIds((s) => new Set(s).add(id));
      try { await save.mutateAsync(merged as any); } finally {
        setSavingIds((s) => { const n = new Set(s); n.delete(id); return n; });
        setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
      }
    }, 700);
  };

  const updateExisting = (id: string, key: keyof Activity, value: any) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
    scheduleSave(id, { [key]: value });
    if (key === "company_name" || key === "employer_city" || key === "employer_state") {
      const a = activities.find((x) => x.id === id);
      const merged = { ...a, ...drafts[id], [key]: value } as Partial<Activity>;
      scheduleAutoEnrich(id, merged);
    }
  };

  const updateNew = (key: keyof Activity, value: any) => {
    setDraftNew((d) => {
      const next = { ...d, [key]: value };
      if (key === "company_name" || key === "employer_city" || key === "employer_state") {
        scheduleAutoEnrich(NEW_ROW_KEY, next);
      }
      return next;
    });
  };

  // Auto-enrich employer info from web after the user pauses typing the company.
  // Only runs when contact fields are empty so we never overwrite user-entered data.
  const scheduleAutoEnrich = (key: string, row: Partial<Activity>) => {
    if (enrichTimers.current[key]) window.clearTimeout(enrichTimers.current[key]);
    enrichTimers.current[key] = window.setTimeout(() => runAutoEnrich(key, row), 1200);
  };

  const runAutoEnrich = async (key: string, row: Partial<Activity>) => {
    const company = row.company_name?.trim();
    if (!company || company.length < 2) return;
    const alreadyFilled = !!(row.employer_address || row.employer_website || row.employer_phone);
    if (alreadyFilled) return;
    const dedupe = `${company.toLowerCase()}|${(row.employer_city ?? "").toLowerCase()}|${(row.employer_state ?? "").toLowerCase()}`;
    if (enrichedKeys.current.has(`${key}:${dedupe}`)) return;
    enrichedKeys.current.add(`${key}:${dedupe}`);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-employer", {
        body: { company, city: row.employer_city, state: row.employer_state },
      });
      if (error || (data as any)?.error) return;
      const patch: Partial<Activity> = {
        employer_address: (data as any).address || undefined,
        employer_city: (data as any).city || row.employer_city || undefined,
        employer_state: (data as any).state || row.employer_state || undefined,
        employer_website: (data as any).website || undefined,
        employer_phone: (data as any).phone || undefined,
      };
      // Drop empty values so we don't clobber anything.
      Object.keys(patch).forEach((k) => { if (!(patch as any)[k]) delete (patch as any)[k]; });
      if (!Object.keys(patch).length) return;

      if (key === NEW_ROW_KEY) {
        setDraftNew((d) => {
          const next = { ...d };
          for (const [k, v] of Object.entries(patch)) {
            if (!(next as any)[k]) (next as any)[k] = v;
          }
          return next;
        });
      } else {
        const current = activities.find((a) => a.id === key);
        if (!current) return;
        const merged: Partial<Activity> = { ...current };
        for (const [k, v] of Object.entries(patch)) {
          if (!(merged as any)[k]) (merged as any)[k] = v;
        }
        setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
        try { await save.mutateAsync(merged as any); } catch { /* silent */ }
      }
      toast.success(`Auto-filled employer info for ${company}`);
    } catch {
      // silent — user can still click the Sparkles button manually
    }
  };

  const commitNew = async () => {
    if (!draftNew.date || !draftNew.company_name?.trim() || !draftNew.activity_type) return;
    setSavingIds((s) => new Set(s).add(NEW_ROW_KEY));
    try {
      await save.mutateAsync(draftNew as any);
      setDraftNew({ ...DEFAULT_NEW_ROW });
    } finally {
      setSavingIds((s) => { const n = new Set(s); n.delete(NEW_ROW_KEY); return n; });
    }
  };

  // Auto-commit new row when it has minimum required
  useEffect(() => {
    if (draftNew.date && draftNew.company_name?.trim() && draftNew.activity_type && !savingIds.has(NEW_ROW_KEY)) {
      const t = setTimeout(commitNew, 800);
      return () => clearTimeout(t);
    }
  }, [draftNew.date, draftNew.company_name, draftNew.activity_type]);

  const valueFor = (a: Activity, key: keyof Activity) => {
    const draft = drafts[a.id];
    return (draft && key in draft ? (draft as any)[key] : (a as any)[key]) ?? "";
  };

  const enrich = async (a: Activity) => {
    if (!a.company_name?.trim()) { toast.error("Add an Employer name first"); return; }
    setEnrichingId(a.id);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-employer", {
        body: { company: a.company_name, city: a.employer_city, state: a.employer_state },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const patch: Partial<Activity> = {
        employer_address: (data as any).address || a.employer_address || null,
        employer_city: (data as any).city || a.employer_city || null,
        employer_state: (data as any).state || a.employer_state || null,
        employer_website: (data as any).website || a.employer_website || null,
        employer_phone: (data as any).phone || a.employer_phone || null,
      };
      await save.mutateAsync({ ...a, ...patch });
      toast.success("Employer info updated");
    } catch (e: any) {
      toast.error(e.message ?? "Enrichment failed");
    } finally {
      setEnrichingId(null);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const values = await readFileAsRows(file);
      const { rows, skipped } = parseSheetRows(values);
      const fresh = dedupeAgainstExisting(rows, activities);
      const dupes = rows.length - fresh.length;
      if (!fresh.length) { toast.info(`Nothing to import — ${rows.length} rows matched existing records.`); return; }
      await bulk.mutateAsync(fresh);
      let msg = `Imported ${fresh.length} new rows`;
      if (dupes) msg += `, skipped ${dupes} duplicate${dupes === 1 ? "" : "s"}`;
      if (skipped) msg += `, ignored ${skipped} incomplete row${skipped === 1 ? "" : "s"}`;
      toast.success(msg);
    } catch (err: any) {
      toast.error(err.message ?? "Could not read that file");
    }
  };

  const importGoogleSheet = async () => {
    if (!sheetsUrl.trim()) return;
    try {
      const values = await importFromGoogleSheet(sheetsUrl.trim());
      const { rows, skipped } = parseSheetRows(values);
      const fresh = dedupeAgainstExisting(rows, activities);
      const dupes = rows.length - fresh.length;
      if (!fresh.length) { toast.info(`Nothing new — ${rows.length} rows already exist.`); setSheetsDialog(null); return; }
      await bulk.mutateAsync(fresh);
      let msg = `Imported ${fresh.length} rows from Google Sheets`;
      if (dupes) msg += `, skipped ${dupes} duplicate${dupes === 1 ? "" : "s"}`;
      if (skipped) msg += `, ignored ${skipped} incomplete row${skipped === 1 ? "" : "s"}`;
      toast.success(msg);
      setSheetsDialog(null);
      setSheetsUrl("");
    } catch (err: any) {
      toast.error(err.message ?? "Google Sheets import failed");
    }
  };

  const exportNewSheet = async () => {
    try {
      toast.info("Creating Google Sheet…");
      const { url } = await exportToNewGoogleSheet(activities);
      toast.success("Google Sheet created");
      window.open(url, "_blank", "noopener");
    } catch (e: any) { toast.error(e.message ?? "Export failed"); }
  };

  const appendToSheet = async () => {
    if (!sheetsUrl.trim()) return;
    try {
      await appendToGoogleSheet(activities, sheetsUrl.trim());
      toast.success("Appended to Google Sheet");
      setSheetsDialog(null); setSheetsUrl("");
    } catch (e: any) { toast.error(e.message ?? "Append failed"); }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl">Activity sheet</h1>
          <p className="text-sm text-muted-foreground mt-1">Type into the bottom row to add a new activity. Edits save automatically.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
            ready ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
            {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            This week: {completeThisWeek}/{goal}
          </div>
          <span className="text-xs text-muted-foreground hidden md:inline">{weekLabel(startISO, endISO)}</span>
        </div>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activities…" className="pl-8 h-9 w-64" />
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onPickFile} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1.5" /> Import</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Import without overwriting</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => fileRef.current?.click()}>From CSV file</DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileRef.current?.click()}>From Excel file</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSheetsDialog("import")}>From Google Sheet…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><FileDown className="h-4 w-4 mr-1.5" /> Export</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => exportActivitiesCSV(activities)}>As CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportXLSX(activities)}>As Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={exportNewSheet}>To new Google Sheet</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSheetsDialog("append")}>Append to Google Sheet…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]">
        <div className="overflow-auto max-h-[70vh]">
          <table className="text-sm border-collapse min-w-max">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr>
                <th className="sticky left-0 z-20 bg-muted/90 px-2 py-2 text-left font-semibold text-xs text-muted-foreground border-b border-r border-border w-10">#</th>
                <th className="px-2 py-2 text-left font-semibold text-xs text-muted-foreground border-b border-r border-border whitespace-nowrap" style={{ minWidth: 130 }}>
                  Week ending
                </th>
                {SHEET_COLUMNS.map((c) => (
                  <th key={c.key} style={{ minWidth: c.width }} className="px-2 py-2 text-left font-semibold text-xs text-muted-foreground border-b border-r border-border whitespace-nowrap">
                    {c.label}{c.required && <span className="text-destructive ml-0.5">*</span>}
                  </th>
                ))}
                <th className="px-2 py-2 text-left font-semibold text-xs text-muted-foreground border-b border-border whitespace-nowrap" style={{ minWidth: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, idx) => {
                const dateVal = (drafts[a.id]?.date as string | undefined) ?? a.date;
                const we = weekEndingFriday(dateVal);
                return (
                <tr key={a.id} className={cn("hover:bg-muted/30", a.is_complete ? "" : "bg-warning/5")}>
                  <td className="sticky left-0 bg-card px-2 py-1 border-b border-r border-border text-xs text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1.5 border-b border-r border-border text-sm text-muted-foreground whitespace-nowrap bg-muted/20">
                    {we ? fmtDate(we) : "—"}
                  </td>
                  {SHEET_COLUMNS.map((c) => (
                    <td key={c.key} className="border-b border-r border-border p-0">
                      <CellEditor
                        col={c}
                        value={valueFor(a, c.key)}
                        onChange={(v) => updateExisting(a.id, c.key, v)}
                      />
                    </td>
                  ))}
                  <td className="border-b border-border p-1">
                    <div className="flex items-center gap-0.5">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" title="Search the web and fill in address, city, state, website, and phone"
                        onClick={() => enrich(a)} disabled={enrichingId === a.id || !a.company_name?.trim()}>
                        {enrichingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Autofill Company Info
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-1.5" title="Evidence files" onClick={() => setEvidenceFor(a)}>
                        <Paperclip className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-1.5 text-destructive" title="Delete row"
                        onClick={() => { if (confirm("Delete this activity and its evidence?")) del.mutate(a.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {savingIds.has(a.id) && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
                    </div>
                  </td>
                </tr>
                );
              })}

              {/* Always-present blank "new row" */}
              <tr className="bg-primary-soft/20 font-medium">
                <td className="sticky left-0 bg-primary-soft/40 px-2 py-1 border-b border-r border-border text-xs text-primary-deep">+</td>
                <td className="px-2 py-1.5 border-b border-r border-border text-sm text-muted-foreground whitespace-nowrap bg-muted/20">
                  {draftNew.date ? fmtDate(weekEndingFriday(draftNew.date)) : "—"}
                </td>
                {SHEET_COLUMNS.map((c) => (
                  <td key={c.key} className="border-b border-r border-border p-0">
                    <CellEditor
                      col={c}
                      value={(draftNew as any)[c.key] ?? ""}
                      onChange={(v) => updateNew(c.key, v)}
                      placeholder={c.required ? `New ${c.label.toLowerCase()}…` : ""}
                    />
                  </td>
                ))}
                <td className="border-b border-border p-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" title="Search the web and fill in address, city, state, website, and phone"
                      onClick={() => { if (draftNew.company_name?.trim()) runAutoEnrich(NEW_ROW_KEY, draftNew); else toast.error("Add an Employer name first"); }}>
                      <Sparkles className="h-3.5 w-3.5" />
                      Autofill
                    </Button>
                    {savingIds.has(NEW_ROW_KEY) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="text-destructive">*</span> Required. Rows missing details are highlighted. Washington requires at least 3 documented job search activities per claim week.
      </p>

      {/* Evidence dialog */}
      <Dialog open={!!evidenceFor} onOpenChange={(o) => !o && setEvidenceFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Evidence — {evidenceFor?.company_name || "Activity"}</DialogTitle>
            <DialogDescription>Attach screenshots, PDFs, or email proof for this activity.</DialogDescription>
          </DialogHeader>
          {evidenceFor && <EvidencePanel activity={evidenceFor} />}
        </DialogContent>
      </Dialog>

      {/* Google Sheets dialog */}
      <Dialog open={!!sheetsDialog} onOpenChange={(o) => { if (!o) { setSheetsDialog(null); setSheetsUrl(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sheetsDialog === "import" ? "Import from Google Sheet" : "Append to Google Sheet"}</DialogTitle>
            <DialogDescription>
              Paste the share URL of the spreadsheet (must be shared with your connected Google account).
              {sheetsDialog === "import" ? " Existing records won't be overwritten — duplicates will be skipped." : ""}
            </DialogDescription>
          </DialogHeader>
          <Input placeholder="https://docs.google.com/spreadsheets/d/..." value={sheetsUrl} onChange={(e) => setSheetsUrl(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSheetsDialog(null); setSheetsUrl(""); }}>Cancel</Button>
            <Button onClick={sheetsDialog === "import" ? importGoogleSheet : appendToSheet}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              {sheetsDialog === "import" ? "Import" : "Append"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Cell editor ---------- */

function CellEditor({ col, value, onChange, placeholder }: { col: typeof SHEET_COLUMNS[number]; value: any; onChange: (v: any) => void; placeholder?: string }) {
  const v = value ?? "";
  if (col.type === "select" && col.options) {
    return (
      <select
        value={v}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:bg-background focus:ring-2 focus:ring-ring rounded-none"
      >
        <option value="">—</option>
        {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.type === "date") {
    return (
      <input
        type="date"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:bg-background focus:ring-2 focus:ring-ring rounded-none"
      />
    );
  }
  return (
    <input
      type="text"
      value={v}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:bg-background focus:ring-2 focus:ring-ring rounded-none placeholder:text-muted-foreground/60"
    />
  );
}

/* ---------- Evidence panel ---------- */

function EvidencePanel({ activity }: { activity: Activity }) {
  const evidence = useEvidence(activity.id);
  const upload = useUploadEvidence();
  const del = useDeleteEvidence();
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("File too large (max 20MB)"); return; }
    await upload.mutateAsync({ activityId: activity.id, file });
    e.target.value = "";
  };
  const open = async (path: string) => {
    const url = await getEvidenceSignedUrl(path);
    window.open(url, "_blank", "noopener");
  };
  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm cursor-pointer hover:bg-muted">
        <Upload className="h-4 w-4" /> Upload file
        <input type="file" className="hidden" onChange={onUpload} accept="image/*,.pdf,.eml,.msg,.doc,.docx,.txt" />
      </label>
      {evidence.data?.length === 0 && <p className="text-sm text-muted-foreground">No files yet.</p>}
      <ul className="divide-y divide-border">
        {evidence.data?.map((f) => (
          <li key={f.id} className="flex items-center justify-between py-2 text-sm">
            <button onClick={() => open(f.storage_path)} className="text-left hover:underline truncate max-w-[300px]">{f.file_name}</button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate(f)}>Remove</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
