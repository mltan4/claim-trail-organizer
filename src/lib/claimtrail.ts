// Domain types and helpers for ClaimTrail

export const ACTIVITY_TYPES = [
  "Job application",
  "Recruiter outreach",
  "Networking outreach",
  "Interview",
  "WorkSource activity",
  "Training / approved activity",
  "Other",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const METHODS = ["LinkedIn", "Company website", "Email", "Phone", "In person", "Other"] as const;
export type Method = (typeof METHODS)[number];

export const STATUSES = [
  "Applied",
  "Contacted",
  "Interview scheduled",
  "Interview completed",
  "Rejected",
  "Follow-up needed",
] as const;
export type Status = (typeof STATUSES)[number];

export type Activity = {
  id: string;
  user_id: string;
  claim_week_id: string | null;
  date: string; // YYYY-MM-DD
  activity_type: string;
  company_name: string | null;
  job_title: string | null;
  job_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  method: string | null;
  status: string | null;
  notes: string | null;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
};

export type ClaimWeek = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string;
  required_activity_count: number;
  created_at: string;
};

export type EvidenceFile = {
  id: string;
  user_id: string;
  activity_id: string;
  file_name: string;
  file_type: string | null;
  storage_path: string;
  uploaded_at: string;
};

export type Profile = {
  id: string;
  name: string | null;
  state: string;
  weekly_goal: number;
  week_start_day: number;
  reminder_day: number;
  reminder_time: string;
};

export function isActivityComplete(a: Partial<Activity>): boolean {
  if (!a.date || !a.activity_type || !a.method) return false;
  if (!a.company_name || !a.company_name.trim()) return false;
  const optional = [a.job_title, a.contact_name, a.job_url, a.contact_email, a.notes];
  return optional.some((v) => !!v && String(v).trim().length > 0);
}

export function missingFields(a: Partial<Activity>): string[] {
  const missing: string[] = [];
  if (!a.date) missing.push("date");
  if (!a.activity_type) missing.push("activity type");
  if (!a.company_name?.trim()) missing.push("company name");
  if (!a.method) missing.push("method");
  if (![a.job_title, a.contact_name, a.job_url, a.contact_email, a.notes].some((v) => !!v && String(v).trim()))
    missing.push("at least one detail (job title, contact, URL, email, or notes)");
  return missing;
}

// Week math — week starts on configurable day (default Sunday=0)
export function getWeekRange(date: Date, startDay = 0): { start: Date; end: Date } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - startDay + 7) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekLabel(start: string, end: string): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}
