import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import { Activity, EvidenceFile, fmtDate, weekLabel } from "@/lib/claimtrail";
import { supabase } from "@/integrations/supabase/client";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportWeeklyPDF(opts: {
  startDate: string;
  endDate: string;
  activities: Activity[];
  evidenceByActivity: Record<string, EvidenceFile[]>;
  userLabel?: string;
}) {
  const { startDate, endDate, activities, evidenceByActivity, userLabel } = opts;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ClaimTrail — Weekly job search log", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Claim week: ${weekLabel(startDate, endDate)}`, margin, y);
  y += 14;
  if (userLabel) { doc.text(`Claimant: ${userLabel}`, margin, y); y += 14; }
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 14;
  doc.text(`Total activities: ${activities.length}   Complete: ${activities.filter((a) => a.is_complete).length}`, margin, y);
  y += 18;

  autoTable(doc, {
    startY: y,
    head: [["Date", "Type", "Company", "Job title", "Method", "Status", "Complete"]],
    body: activities.map((a) => [
      fmtDate(a.date),
      a.activity_type,
      a.company_name ?? "",
      a.job_title ?? "",
      a.method ?? "",
      a.status ?? "",
      a.is_complete ? "Yes" : "No",
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [135, 168, 120], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  // Detail per activity
  activities.forEach((a) => {
    doc.addPage();
    let yy = margin;
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(`${a.company_name || "Untitled"} — ${a.activity_type}`, margin, yy); yy += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const rows: [string, string][] = [
      ["Date", fmtDate(a.date)],
      ["Job title", a.job_title ?? "—"],
      ["Job URL", a.job_url ?? "—"],
      ["Method", a.method ?? "—"],
      ["Status", a.status ?? "—"],
      ["Contact name", a.contact_name ?? "—"],
      ["Contact email", a.contact_email ?? "—"],
      ["Contact phone", a.contact_phone ?? "—"],
      ["Complete", a.is_complete ? "Yes" : "No"],
    ];
    autoTable(doc, {
      startY: yy,
      body: rows,
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 110 } },
      margin: { left: margin, right: margin },
      theme: "plain",
    });
    yy = (doc as any).lastAutoTable.finalY + 12;
    if (a.notes) {
      doc.setFont("helvetica", "bold"); doc.text("Notes", margin, yy); yy += 14;
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(a.notes, 520);
      doc.text(lines, margin, yy); yy += lines.length * 12 + 8;
    }
    const ev = evidenceByActivity[a.id] ?? [];
    if (ev.length) {
      doc.setFont("helvetica", "bold"); doc.text("Evidence files", margin, yy); yy += 14;
      doc.setFont("helvetica", "normal");
      ev.forEach((f) => { doc.text(`• ${f.file_name}`, margin, yy); yy += 12; });
    }
  });

  doc.save(`ClaimTrail-week-${startDate}.pdf`);
}

export function exportActivitiesCSV(activities: Activity[]) {
  const headers = [
    "date","activity_type","company_name","job_title","job_url","contact_name","contact_email","contact_phone","method","status","notes","is_complete",
  ];
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const rows = activities.map((a) => headers.map((h) => escape((a as any)[h])).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), `claimtrail-activities-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function exportEvidenceZip(opts: {
  startDate: string;
  endDate: string;
  activities: Activity[];
  evidence: EvidenceFile[];
}) {
  const zip = new JSZip();
  const root = zip.folder(`ClaimTrail-evidence-${opts.startDate}`)!;
  // index.csv
  const idxRows = [
    ["activity_date","company","activity_type","file_name","stored_path"].join(","),
    ...opts.evidence.map((f) => {
      const a = opts.activities.find((x) => x.id === f.activity_id);
      return [a?.date ?? "", (a?.company_name ?? "").replace(/,/g, " "), a?.activity_type ?? "", f.file_name, f.storage_path].join(",");
    }),
  ].join("\n");
  root.file("index.csv", idxRows);

  for (const f of opts.evidence) {
    const { data, error } = await supabase.storage.from("evidence").download(f.storage_path);
    if (error || !data) continue;
    const a = opts.activities.find((x) => x.id === f.activity_id);
    const folder = `${a?.date ?? "no-date"}_${(a?.company_name ?? "unknown").replace(/[^\w-]+/g, "_").slice(0, 40)}`;
    root.folder(folder)!.file(f.file_name, data);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `ClaimTrail-evidence-${opts.startDate}.zip`);
}
