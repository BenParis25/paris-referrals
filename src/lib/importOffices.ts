import { supabase } from "./supabase";

export const BUNDLED_OFFICES = 551;

// Upserts the bundled NPI office list. Never touches claims, notes, hidden flags or fax numbers.
export async function importOffices(onProgress?: (msg: string) => void): Promise<{ ok: boolean; count: number; error?: string }> {
  onProgress?.("Loading list…");
  const mod = await import("../data/practices.json");
  const src = (mod.default || mod) as unknown as Array<Record<string, unknown>>;
  const rows = src.map((p) => ({
    id: p.id,
    practice: p.practice,
    address: p.address || "",
    city: p.city || "",
    zip: p.zip || "",
    phone: p.phone || "",
    segment: p.segment,
    system: p.system || "Independent",
    clinicians: p.clinicians || [],
    clinician_count: Number(p.count || 0),
    npis: p.npis || [],
    taxonomy: p.taxonomy || "",
    area: p.area,
    priority: p.priority,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    onProgress?.(`Saving ${Math.min(i + 100, rows.length)} of ${rows.length}…`);
    const { error } = await supabase.from("practices").upsert(rows.slice(i, i + 100), { onConflict: "id" });
    if (error) return { ok: false, count: i, error: error.message };
  }
  return { ok: true, count: rows.length };
}
