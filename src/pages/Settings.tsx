import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfile, useUpdateProfile } from "@/hooks/useClaimTrail";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Settings() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [form, setForm] = useState({ name: "", state: "Washington", weekly_goal: 3, week_start_day: 0, reminder_day: 6, reminder_time: "18:00" });

  useEffect(() => {
    if (profile) setForm({
      name: profile.name ?? "",
      state: profile.state,
      weekly_goal: profile.weekly_goal,
      week_start_day: profile.week_start_day,
      reminder_day: profile.reminder_day,
      reminder_time: profile.reminder_time,
    });
  }, [profile]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(form);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">How ClaimTrail works for you.</p>
      </header>

      <form onSubmit={save} className="ct-card p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Your name</Label>
            <Input value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>State</Label>
            <Input value={form.state} maxLength={50} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label>Weekly goal</Label>
            <Input type="number" min={1} max={20} value={form.weekly_goal} onChange={(e) => setForm({ ...form, weekly_goal: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Claim week starts</Label>
            <Select value={String(form.week_start_day)} onValueChange={(v) => setForm({ ...form, week_start_day: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reminder day</Label>
            <Select value={String(form.reminder_day)} onValueChange={(v) => setForm({ ...form, reminder_day: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Reminder time</Label>
            <Input type="time" value={form.reminder_time} onChange={(e) => setForm({ ...form, reminder_time: e.target.value })} />
          </div>
        </div>

        <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save settings"}</Button>
      </form>

      <p className="text-xs text-muted-foreground text-center">
        ClaimTrail helps you organize job search records. It does not submit unemployment claims or guarantee eligibility.
      </p>
    </div>
  );
}
