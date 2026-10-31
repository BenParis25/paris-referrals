export const fmtWhen = (ts?: string | null) => {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};
export const daysSince = (ts?: string | null) => (ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : 9999);
export const isoToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const fmtDate = (d?: string | null) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

export async function copyText(text: string, fallback?: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallback) {
      fallback.focus();
      fallback.select();
    }
    return false;
  }
}

export const firstName = (n: string) => n.split(" ")[0];
