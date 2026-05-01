import { Activity } from "@/lib/claimtrail";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const tone: Record<string, string> = {
    Applied: "bg-primary-soft text-primary-deep",
    Contacted: "bg-primary-soft text-primary-deep",
    "Interview scheduled": "bg-amber-100 text-amber-900",
    "Interview completed": "bg-emerald-100 text-emerald-900",
    Rejected: "bg-stone-200 text-stone-700",
    "Follow-up needed": "bg-orange-100 text-orange-900",
  };
  return <span className={cn("ct-chip", tone[status] ?? "bg-muted text-muted-foreground")}>{status}</span>;
}

export function CompletenessBadge({ a }: { a: Activity }) {
  return a.is_complete ? (
    <span className="ct-chip bg-success/15 text-success">✓ Complete</span>
  ) : (
    <span className="ct-chip bg-warning/15 text-warning">Needs info</span>
  );
}
