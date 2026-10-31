import { createClient } from "@supabase/supabase-js";

// The publishable key is meant for browsers; access is enforced by row-level security in the database.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://dlbcrzlbzquhmrihxnmg.supabase.co";
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "sb_publishable_KxbOfjxlDtY3MNMuamAd9w_hjxQAEk7";

export const configured = Boolean(url && key);
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

export const WORKSPACE_DOMAIN = "pariscounselingllc.org";
