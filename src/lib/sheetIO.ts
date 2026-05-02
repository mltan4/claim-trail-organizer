import * as XLSX from "xlsx";
import { Activity, SHEET_COLUMNS, activityDedupeKey, ACTIVITY_TYPES, METHODS, CONTACT_TYPES, STATUSES, isoDate } from "@/lib/claimtrail";
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob } from "@/lib/exports";

export const SHEET_HEADERS = SHEET_COLUMNS.map((c) => c.label);
export const SHEET_KEYS = SHEET_COLUMNS.map((c) => c.key);

export function activitiesToRows(activities: Activity[]): (string | null)[][] {
  return activities.map((a) => SHEET_KEYS.map((k) => (a[k] == null ? "" : String(a[k]))));
}

export function exportXLSX(activities: Activity[]) {
  const data = [SHEET_HEADERS, ...activitiesToRows(activities)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Activities");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `claimtrail-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Normalize various synonyms to our canonical enum values
function pickEnum(value: string, options: readonly string[]): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  for (const o of options) if (o.toLowerCase() === v) return o;
  // soft matches
  if (options === ACTIVITY_TYPES) {
    if (v.includes("employer")) return "Employer contact";
    if (v.includes("worksource")) return "WorkSource activity";
    if (v.includes("other")) return "Other activity";
  }
  if (options === METHODS) {
    if (v.includes("online") || v.includes("web") || v.includes("linkedin")) return "Online";
    if (v.includes("person")) return "In-person";
    if (v.includes("phone")) return "By phone";
    if (v.includes("email") || v.includes("mail")) return v.includes("mail") && !v.includes("e-mail") && !v.includes("email") ? "By mail" : "By email";
  }
  if (options === CONTACT_TYPES) {
    if (v.includes("appl") || v.includes("resume")) return "Application/Resume";
    if (v.includes("interv")) return "Interview";
    if (v.includes("inquir")) return "Inquiry";
  }
  return null;
}

function parseDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return isoDate(value);
  const s = String(value).trim();
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or M/D/YY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [_, mo, d, y] = m;
    if (y.length === 2) y = (parseInt(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Excel serial number
  if (typeof value === "number" && value > 25569) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return isoDate(dt);
  return null;
}

// Parse a 2D array (header row + data) into Activity-shaped partials.
// Returns { rows, skipped } -- skipped rows lack required fields.
export function parseSheetRows(values: any[][]): { rows: Partial<Activity>[]; skipped: number } {
  if (!values?.length) return { rows: [], skipped: 0 };
  const [headerRow, ...dataRows] = values;
  const headerIdx: Record<string, number> = {};
  headerRow.forEach((h: any, i: number) => {
    const key = String(h ?? "").trim().toLowerCase();
    headerIdx[key] = i;
  });
  const findCol = (...names: string[]): number => {
    for (const n of names) {
      const idx = headerIdx[n.toLowerCase()];
      if (idx != null) return idx;
    }
    return -1;
  };
  const map = {
    date: findCol("contact date", "date"),
    activity_type: findCol("activity type", "activity"),
    company_name: findCol("employer", "company", "company name", "employer or business name"),
    job_title: findCol("job title", "title", "job title or job reference number"),
    method: findCol("how contacted", "method", "how did you make the contact?"),
    contact_type: findCol("type of contact", "contact type"),
    contact_name: findCol("contact name"),
    contact_email: findCol("contact email", "email"),
    contact_phone: findCol("contact phone", "phone"),
    employer_address: findCol("address", "employer address"),
    employer_city: findCol("city"),
    employer_state: findCol("state"),
    employer_website: findCol("website", "employer website"),
    employer_phone: findCol("employer phone"),
    job_url: findCol("job url", "url"),
    status: findCol("status"),
    notes: findCol("notes"),
  };
  const get = (row: any[], i: number) => (i >= 0 ? (row[i] == null ? "" : String(row[i]).trim()) : "");

  const rows: Partial<Activity>[] = [];
  let skipped = 0;
  for (const r of dataRows) {
    if (!r || r.every((c) => c == null || String(c).trim() === "")) continue;
    const date = parseDate(map.date >= 0 ? r[map.date] : null);
    const company = get(r, map.company_name);
    if (!date || !company) { skipped++; continue; }
    const partial: Partial<Activity> = {
      date,
      company_name: company,
      activity_type: pickEnum(get(r, map.activity_type), ACTIVITY_TYPES) ?? "Employer contact",
      method: pickEnum(get(r, map.method), METHODS) ?? "Online",
      contact_type: pickEnum(get(r, map.contact_type), CONTACT_TYPES) ?? "Application/Resume",
      status: pickEnum(get(r, map.status), STATUSES) ?? "Applied",
      job_title: get(r, map.job_title) || null,
      contact_name: get(r, map.contact_name) || null,
      contact_email: get(r, map.contact_email) || null,
      contact_phone: get(r, map.contact_phone) || null,
      employer_address: get(r, map.employer_address) || null,
      employer_city: get(r, map.employer_city) || null,
      employer_state: get(r, map.employer_state) || null,
      employer_website: get(r, map.employer_website) || null,
      employer_phone: get(r, map.employer_phone) || null,
      job_url: get(r, map.job_url) || null,
      notes: get(r, map.notes) || null,
    };
    rows.push(partial);
  }
  return { rows, skipped };
}

export function dedupeAgainstExisting(incoming: Partial<Activity>[], existing: Activity[]): Partial<Activity>[] {
  const seen = new Set(existing.map(activityDedupeKey));
  const out: Partial<Activity>[] = [];
  for (const r of incoming) {
    const key = activityDedupeKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export async function readFileAsRows(file: File): Promise<any[][]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || file.type === "text/csv") {
    const text = await file.text();
    const wb = XLSX.read(text, { type: "string" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
}

/* ---------------- Google Sheets via edge function ---------------- */

async function callSheets(action: string, body: Record<string, any>) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const { data, error } = await supabase.functions.invoke("google-sheets", {
    body: { action, ...body },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function exportToNewGoogleSheet(activities: Activity[]) {
  const rows = activitiesToRows(activities);
  const res: any = await callSheets("create", { headers: SHEET_HEADERS, rows, title: `ClaimTrail ${new Date().toISOString().slice(0, 10)}` });
  return res as { spreadsheetId: string; url: string };
}

export async function appendToGoogleSheet(activities: Activity[], spreadsheetIdOrUrl: string, range = "Sheet1!A1") {
  const rows = activitiesToRows(activities);
  return callSheets("append", { headers: SHEET_HEADERS, rows, spreadsheetIdOrUrl, range });
}

export async function importFromGoogleSheet(spreadsheetIdOrUrl: string, range = "Sheet1") {
  const res: any = await callSheets("import", { spreadsheetIdOrUrl, range });
  return res.values as any[][];
}
