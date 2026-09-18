// POST /api/leads — the public "Interested" form on the marketing site.
// Server-side so the browser never talks to the database directly from an unauthenticated page.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const recent = new Map<string, number[]>(); // best-effort per-instance rate limit

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (hits.length >= 5) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  hits.push(now); recent.set(ip, hits);

  const b = await req.json().catch(() => ({}));
  if (b.website) return NextResponse.json({ ok: true }); // honeypot field filled by bots → pretend success
  const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const lead = {
    id: "L-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    name: str(b.name), role: str(b.role), company: str(b.company), email: str(b.email), phone: str(b.phone, 40),
    city: str(b.city), units: str(b.units, 40), notes: str(b.notes, 2000), status: "new",
  };
  if (!lead.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await anon.from("leads").insert(lead);
  if (error) return NextResponse.json({ error: "Could not save your request. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true, id: lead.id });
}
