import { Link } from "react-router-dom";
import { Plus, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useActivities } from "@/hooks/useClaimTrail";
import { useProfile } from "@/hooks/useClaimTrail";
import { getWeekRange, isoDate, weekLabel, isActivityComplete, missingFields } from "@/lib/claimtrail";
import { StatusBadge, CompletenessBadge } from "@/components/Badges";

export default function Dashboard() {
  const { data: profile } = useProfile();
  const { data: activities = [], isLoading } = useActivities();
  const startDay = profile?.week_start_day ?? 0;
  const goal = profile?.weekly_goal ?? 3;

  const { start, end } = getWeekRange(new Date(), startDay);
  const startISO = isoDate(start);
  const endISO = isoDate(end);

  const thisWeek = activities.filter((a) => a.date >= startISO && a.date <= endISO);
  const complete = thisWeek.filter((a) => a.is_complete);
  const incomplete = thisWeek.filter((a) => !a.is_complete);
  const ready = complete.length >= goal && incomplete.length === 0;
  const pct = Math.min(100, (complete.length / goal) * 100);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Hello{profile?.name ? `, ${profile.name.split("@")[0]}` : ""}</p>
        <h1 className="font-serif text-3xl mt-1">This week</h1>
        <p className="text-sm text-muted-foreground mt-1">{weekLabel(startISO, endISO)}</p>
      </header>

      <section className="ct-card p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Progress</div>
            <div className="font-serif text-4xl mt-1">
              {complete.length}<span className="text-muted-foreground">/{goal}</span>
            </div>
            <div className="text-sm text-muted-foreground">complete activities</div>
          </div>
          <div className="text-right">
            {ready ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-success/15 text-success px-3 py-1.5 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Ready to file
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-warning/15 text-warning px-3 py-1.5 text-sm font-semibold">
                <Clock className="h-4 w-4" /> {goal - complete.length} more to go
              </div>
            )}
          </div>
        </div>
        <Progress value={pct} className="h-2 mt-5" />
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild><Link to="/add"><Plus className="h-4 w-4 mr-1.5" /> Add activity</Link></Button>
          <Button asChild variant="outline"><Link to="/log">Open weekly log</Link></Button>
        </div>
      </section>

      {incomplete.length > 0 && (
        <section className="ct-card p-5 border-warning/40 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Missing information</div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {incomplete.length} {incomplete.length === 1 ? "activity needs" : "activities need"} more details before they count toward this week.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {incomplete.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium">{a.company_name || "Untitled"}</span>{" "}
                    <span className="text-muted-foreground">— missing: {missingFields(a).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="font-serif text-xl mb-3">This week's activities</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : thisWeek.length === 0 ? (
          <div className="ct-card p-8 text-center">
            <p className="text-muted-foreground">No activities yet this week.</p>
            <Button asChild className="mt-4"><Link to="/add"><Plus className="h-4 w-4 mr-1.5" />Add your first activity</Link></Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {thisWeek.map((a) => (
              <li key={a.id} className="ct-card p-4">
                <Link to={`/log#${a.id}`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{a.company_name || "—"}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {a.activity_type}{a.job_title ? ` · ${a.job_title}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <CompletenessBadge a={a} />
                      <StatusBadge status={a.status} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground text-center pt-2">
        Reminder: Washington requires at least 3 documented job search activities per claim week.
      </p>
    </div>
  );
}
