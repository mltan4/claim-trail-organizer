// Domain types and helpers for ClaimTrail

export const ACTIVITY_TYPES = [
  "Employer contact",
  "WorkSource activity",
  "Other activity",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const METHODS = ["Online", "In-person", "By phone", "By email", "By mail", "Other"] as const;
export type Method = (typeof METHODS)[number];

export const CONTACT_TYPES = ["Application/Resume", "Interview", "Inquiry"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

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
  date: string; // YYYY-MM-DD  -- contact date
  activity_type: string;
  company_name: string | null; // employer
  job_title: string | null;
  job_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  method: string | null;
  status: string | null;
  notes: string | null;
  is_complete: boolean;
  contact_type: string | null;
  employer_address: string | null;
  employer_city: string | null;
  employer_state: string | null;
  employer_website: string | null;
  employer_phone: string | null;
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

export const DEFAULT_NEW_ROW: Partial<Activity> = {
  date: "",
  activity_type: "Employer contact",
  method: "Online",
  contact_type: "Application/Resume",
  status: "Applied",
};

export function isActivityComplete(a: Partial<Activity>): boolean {
  if (!a.date || !a.activity_type || !a.method) return false;
  if (!a.company_name || !a.company_name.trim()) return false;
  const optional = [a.job_title, a.contact_name, a.job_url, a.contact_email, a.notes, a.employer_address, a.employer_phone, a.employer_website];
  return optional.some((v) => !!v && String(v).trim().length > 0);
}

export function missingFields(a: Partial<Activity>): string[] {
  const missing: string[] = [];
  if (!a.date) missing.push("date");
  if (!a.activity_type) missing.push("activity type");
  if (!a.company_name?.trim()) missing.push("employer");
  if (!a.method) missing.push("method");
  if (![a.job_title, a.contact_name, a.job_url, a.contact_email, a.notes, a.employer_address, a.employer_phone, a.employer_website].some((v) => !!v && String(v).trim()))
    missing.push("at least one detail (job title, contact, URL, address, phone, or notes)");
  return missing;
}

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

// Saturday of the Sunday–Saturday week containing the given date (ISO YYYY-MM-DD).
export function weekEndingFriday(dateISO: string | null | undefined): string {
  if (!dateISO) return "";
  const d = new Date(dateISO + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const offset = 6 - dow;
  d.setDate(d.getDate() + offset);
  return isoDate(d);
}

// Spreadsheet column model — order matters for CSV/XLSX
export type SheetCol = {
  key: keyof Activity;
  label: string;
  width: number;
  type?: "date" | "select" | "text" | "url";
  options?: readonly string[];
  required?: boolean;
};

export const SHEET_COLUMNS: SheetCol[] = [
  { key: "date", label: "Contact date", width: 130, type: "date", required: true },
  { key: "activity_type", label: "Activity type", width: 160, type: "select", options: ACTIVITY_TYPES, required: true },
  { key: "company_name", label: "Employer", width: 200, type: "text", required: true },
  { key: "job_title", label: "Job title", width: 180, type: "text" },
  { key: "method", label: "How contacted", width: 130, type: "select", options: METHODS },
  { key: "contact_type", label: "Type of contact", width: 150, type: "select", options: CONTACT_TYPES },
  { key: "contact_name", label: "Contact name", width: 160, type: "text" },
  { key: "contact_email", label: "Contact email", width: 200, type: "text" },
  { key: "contact_phone", label: "Contact phone", width: 140, type: "text" },
  { key: "employer_address", label: "Address", width: 220, type: "text" },
  { key: "employer_city", label: "City", width: 140, type: "text" },
  { key: "employer_state", label: "State", width: 80, type: "text" },
  { key: "employer_website", label: "Website", width: 200, type: "url" },
  { key: "employer_phone", label: "Employer phone", width: 140, type: "text" },
  { key: "job_url", label: "Job URL", width: 220, type: "url" },
  { key: "status", label: "Status", width: 150, type: "select", options: STATUSES },
  { key: "notes", label: "Notes", width: 280, type: "text" },
];

// Duplicate key for import dedupe
export function activityDedupeKey(a: Partial<Activity>): string {
  return [a.date ?? "", (a.company_name ?? "").trim().toLowerCase(), (a.job_title ?? "").trim().toLowerCase(), (a.activity_type ?? "").trim().toLowerCase()].join("|");
}
