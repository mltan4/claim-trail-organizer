import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useActivities, useDeleteActivity, useEvidence } from "@/hooks/useClaimTrail";
import { useProfile } from "@/hooks/useClaimTrail";
import { Activity, fmtDate, getWeekRange, isoDate, weekLabel } from "@/lib/claimtrail";
import { CompletenessBadge, StatusBadge } from "@/components/Badges";
import { Download, Edit2, FileSpreadsheet, FileText, Trash2 } from "lucide-react";
import ActivityForm from "@/components/ActivityForm";
import { exportActivitiesCSV, exportWeeklyPDF } from "@/lib/exports";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Group = { key: string; start: string; end: string; items: Activity[] };

export default function WeeklyLog() {
  const { data: profile } = useProfile();
  const startDay = profile?.week_start_day ?? 0;
  const goal = profile?.weekly_goal ?? 3;
  const { data: activities = [] } = useActivities();
  const del = useDeleteActivity();
  const [editing, setEditing] = useState<Activity | null>(null);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const a of activities) {
      const { start, end } = getWeekRange(new Date(a.date + "T00:00:00"), startDay);
      const key = isoDate(start);
      if (!map.has(key)) map.set(key, { key, start: key, end: isoDate(end), items: [] });
      map.get(key)!.items.push(a);
    }
    return [...map.values()].sort((a, b) => (a.start < b.start ? 1 : -1));
  }, [activities, startDay]);

  const exportPDF = async (g: Group) => {
    const ids = g.items.map((i) => i.id);
    const { data: evidence } = await supabase.from("evidence_files").select("*").in("activity_id", ids);
    const evidenceByActivity: Record<string, any[]> = {};
    (evidence ?? []).forEach((e: any) => { (evidenceByActivity[e.activity_id] ??= []).push(e); });
    exportWeeklyPDF({ startDate: g.start, endDate: g.end, activities: g.items, evidenceByActivity });
    toast.success("PDF generated");
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl">Weekly log</h1>
          <p className="text-sm text-muted-foreground mt-1">Activities grouped by claim week.</p>
        </div>
        <Button variant="outline" onClick={() => exportActivitiesCSV(activities)}>
          <FileSpreadsheet className="h-4 w-4 mr-1.5" /> CSV backup
        </Button>
      </header>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">No activities yet. Add one to get started.</p>}

      <div className="space-y-8">
        {groups.map((g) => {
          const completeCount = g.items.filter((a) => a.is_complete).length;
          const ready = completeCount >= goal;
          return (
            <section key={g.key} id={`week-${g.key}`}>
              <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
                <div>
                  <h2 className="font-serif text-xl">{weekLabel(g.start, g.end)}</h2>
                  <div className="text-sm text-muted-foreground">
                    {completeCount}/{goal} complete · {g.items.length} total{" "}
                    {ready ? <span className="text-success font-semibold">· Ready to file</span> : <span className="text-warning font-semibold">· Incomplete</span>}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => exportPDF(g)}>
                  <FileText className="h-4 w-4 mr-1.5" /> Export PDF
                </Button>
              </div>

              <ol className="relative border-s-2 border-primary-soft ms-2 space-y-3">
                {g.items.map((a) => (
                  <li key={a.id} id={a.id} className="ms-5 ct-card p-4 -ms-[1px] relative">
                    <span className="absolute -left-[34px] top-5 grid h-3 w-3 place-items-center rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">{fmtDate(a.date)}</div>
                        <div className="font-semibold truncate">{a.company_name || "—"}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {a.activity_type}{a.job_title ? ` · ${a.job_title}` : ""}{a.method ? ` · ${a.method}` : ""}
                        </div>
                        {a.notes && <p className="text-sm mt-1.5 line-clamp-2 text-muted-foreground">{a.notes}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <CompletenessBadge a={a} />
                        <StatusBadge status={a.status} />
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-3">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(a)}><Edit2 className="h-3.5 w-3.5 mr-1" />Edit</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this activity?</AlertDialogTitle>
                            <AlertDialogDescription>This will also remove its attached evidence files.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => del.mutate(a.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit activity</DialogTitle></DialogHeader>
          {editing && <ActivityForm initial={editing} onSaved={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
