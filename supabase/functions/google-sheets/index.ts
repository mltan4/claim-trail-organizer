import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function gwHeaders() {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
  if (!GOOGLE_SHEETS_API_KEY) throw new Error("Google Sheets is not connected");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
    "Content-Type": "application/json",
  };
}

function extractIdFromUrl(input: string): string | null {
  if (!input) return null;
  if (!input.includes("/")) return input.trim();
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, headers, rows, title, spreadsheetIdOrUrl, range } = await req.json();
    const headersGw = gwHeaders();

    if (action === "create") {
      // Create new spreadsheet, then write headers + rows
      const create = await fetch(`${GATEWAY}/spreadsheets`, {
        method: "POST", headers: headersGw,
        body: JSON.stringify({ properties: { title: title || `ClaimTrail export ${new Date().toISOString().slice(0, 10)}` } }),
      });
      const created = await create.json();
      if (!create.ok) throw new Error(`Create failed: ${JSON.stringify(created)}`);
      const sid = created.spreadsheetId;
      const sheetName = created.sheets?.[0]?.properties?.title ?? "Sheet1";
      const values = [headers, ...rows];
      const writeRange = `${sheetName}!A1`;
      const wr = await fetch(`${GATEWAY}/spreadsheets/${sid}/values/${writeRange}?valueInputOption=USER_ENTERED`, {
        method: "PUT", headers: headersGw,
        body: JSON.stringify({ range: writeRange, majorDimension: "ROWS", values }),
      });
      if (!wr.ok) throw new Error(`Write failed: ${await wr.text()}`);
      return new Response(JSON.stringify({ spreadsheetId: sid, url: created.spreadsheetUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "append") {
      const sid = extractIdFromUrl(spreadsheetIdOrUrl);
      if (!sid) throw new Error("Invalid spreadsheet URL or ID");
      const r = range || "Sheet1!A1";
      const ap = await fetch(`${GATEWAY}/spreadsheets/${sid}/values/${r}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: "POST", headers: headersGw,
        body: JSON.stringify({ values: [headers, ...rows] }),
      });
      if (!ap.ok) throw new Error(`Append failed: ${await ap.text()}`);
      return new Response(JSON.stringify({ ok: true, spreadsheetId: sid }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "import") {
      const sid = extractIdFromUrl(spreadsheetIdOrUrl);
      if (!sid) throw new Error("Invalid spreadsheet URL or ID");
      const r = range || "Sheet1";
      const gr = await fetch(`${GATEWAY}/spreadsheets/${sid}/values/${r}`, { headers: headersGw });
      const body = await gr.json();
      if (!gr.ok) throw new Error(`Read failed: ${JSON.stringify(body)}`);
      return new Response(JSON.stringify({ values: body.values ?? [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("google-sheets error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
