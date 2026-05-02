import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { company, city, state } = await req.json();
    if (!company || typeof company !== "string" || !company.trim()) {
      return new Response(JSON.stringify({ error: "company is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const locHint = [city, state].filter(Boolean).join(", ");
    const userPrompt = `Find the official business contact info for: "${company.trim()}"${locHint ? ` (location hint: ${locHint})` : ""}. Return only verifiable details from the company's official website or reputable directories. If unsure, leave the field empty.`;

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You extract structured employer contact info. Only return fields you are reasonably confident about. Prefer the company's headquarters or primary office. Format phone as a single string (digits + punctuation), website as a full https URL." },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "employer_contact",
          description: "Employer contact info",
          parameters: {
            type: "object",
            properties: {
              address: { type: "string", description: "Street address" },
              city: { type: "string" },
              state: { type: "string", description: "Two-letter US state code if applicable" },
              website: { type: "string", description: "Full https URL" },
              phone: { type: "string", description: "Main phone number" },
            },
            required: [],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "employer_contact" } },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit. Try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "Lovable AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "Enrichment failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: Record<string, string> = {};
    try { parsed = JSON.parse(call?.function?.arguments ?? "{}"); } catch { parsed = {}; }

    return new Response(JSON.stringify({
      address: parsed.address ?? "",
      city: parsed.city ?? "",
      state: parsed.state ?? "",
      website: parsed.website ?? "",
      phone: parsed.phone ?? "",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
