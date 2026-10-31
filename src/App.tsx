import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase, WORKSPACE_DOMAIN } from "./lib/supabase";
import type { Claim, Clinician, Practice, Settings } from "./lib/types";
import MyWeek from "./views/MyWeek";
import Offices from "./views/Offices";
import Team from "./views/Team";
import Admin from "./views/Admin";
import OfficePanel from "./views/OfficePanel";
import { BUNDLED_OFFICES, importOffices } from "./lib/importOffices";

const DEFAULT_SETTINGS: Settings = {
  phone: "317-308-4007",
  fax: "",
  email: "ContactUs@pariscounselingllc.org",
  request_url: "pariscounseling.clientsecure.me",
  greenwood: "3209 W. Smith Valley Rd, Suite 216, Greenwood, IN 46142",
  lawrence: "9165 Otis Ave, Suite 156, Indianapolis, IN 46216",
};

interface Store {
  me: Clinician;
  clinicians: Clinician[];
  practices: Practice[];
  claims: Record<string, Claim>;
  taken: Set<string>;
  claimsFor: (practiceId: string) => Claim[];
  settings: Settings;
  reload: (what?: ("clinicians" | "practices" | "claims" | "settings")[]) => Promise<void>;
  toast: (t: string) => void;
  openOffice: (id: string) => void;
  byId: (id: string | null | undefined) => Clinician | undefined;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("store missing");
  return s;
};

type Tab = "week" | "offices" | "team" | "admin";
const TABS: { id: Tab; label: string; admin?: boolean }[] = [
  { id: "week", label: "My week" },
  { id: "offices", label: "Find offices" },
  { id: "team", label: "Team openings", admin: true },
  { id: "admin", label: "Admin", admin: true },
];
const tabFromHash = (): Tab => {
  const h = location.hash.replace("#", "") as Tab;
  return TABS.some((t) => t.id === h) ? h : "week";
};

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) return <Gate title="Not configured">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</Gate>;
  if (session === undefined) return <Gate title="Loading…" />;
  if (!session) return <SignIn />;
  return <Signed session={session} />;
}

function Gate({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="signin">
      <div className="signin-card">
        <small className="seg">Paris Counseling</small>
        <b>{title}</b>
        {children && <div className="muted">{children}</div>}
      </div>
    </div>
  );
}

function SignIn() {
  const [err, setErr] = useState("");
  const go = async () => {
    setErr("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin, queryParams: { prompt: "select_account" } },
    });
    if (error) setErr(error.message);
  };
  return (
    <div className="signin">
      <div className="signin-card">
        <small className="seg">Paris Counseling · team only</small>
        <b>Referrals</b>
        <p className="muted" style={{ margin: 0 }}>
          Keep your openings current, claim offices to call, and send referral letters in your own name.
        </p>
        <button className="gbtn" onClick={go} type="button">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
            <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.6l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Sign in with your @{WORKSPACE_DOMAIN} account
        </button>
        {err && <p className="notice warn">{err}</p>}
        <p className="small muted" style={{ margin: 0 }}>Practice contact info only. Never enter client names or health details.</p>
      </div>
    </div>
  );
}

function Signed({ session }: { session: Session }) {
  const [me, setMe] = useState<Clinician | null | undefined>(undefined);
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [practices, setPractices] = useState<Practice[]>([]);
  const [claims, setClaims] = useState<Record<string, Claim>>({});
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>(tabFromHash());
  const [openId, setOpenId] = useState<string | null>(null);
  const [toastText, setToastText] = useState("");
  const toastTimer = useRef<number>();
  const email = (session.user.email || "").toLowerCase();

  const toast = useCallback((t: string) => {
    setToastText(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(""), 2400);
  }, []);

  const reload = useCallback(
    async (what: ("clinicians" | "practices" | "claims" | "settings")[] = ["clinicians", "practices", "claims", "settings"]) => {
      const jobs: PromiseLike<unknown>[] = [];
      if (what.includes("clinicians"))
        jobs.push(
          supabase.from("clinicians").select("*").order("sort").order("name").then(({ data }) => {
            const list = (data || []) as Clinician[];
            setClinicians(list);
            setMe(list.find((c) => c.active && (c.email || "").toLowerCase() === email) || null);
          }),
        );
      if (what.includes("practices"))
        jobs.push(
          supabase.from("practices").select("*").range(0, 1999).then(({ data }) => setPractices((data || []) as Practice[])),
        );
      if (what.includes("claims"))
        jobs.push(
          supabase.from("claims").select("*").range(0, 1999).then(({ data }) => {
            const m: Record<string, Claim> = {};
            ((data || []) as Claim[]).forEach((c) => (m[c.practice_id + "|" + c.lane] = c));
            setClaims(m);
          }),
        );
      if (what.includes("claims"))
        jobs.push(
          supabase.rpc("taken_offices").then(({ data }) => {
            setTaken(new Set(((data || []) as unknown[]).map((r) => (typeof r === "string" ? r : Object.values(r as object)[0] as string))));
          }),
        );
      if (what.includes("settings"))
        jobs.push(
          supabase.from("settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
            if (data) setSettings({ ...DEFAULT_SETTINGS, ...(data as Settings) });
          }),
        );
      await Promise.all(jobs);
    },
    [email],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  // First admin sign-in: load the bundled NPI office list if the database doesn't have it yet.
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (!me?.is_admin || autoLoaded.current || practices.length === 0 && clinicians.length === 0) return;
    if (practices.length >= BUNDLED_OFFICES - 5) return;
    autoLoaded.current = true;
    toast("Loading the office list…");
    importOffices().then(async (r) => {
      if (r.ok) {
        await reload(["practices"]);
        toast(`Office list ready: ${r.count} offices`);
      } else toast("Couldn't load the office list: " + r.error);
    });
  }, [me, practices.length, clinicians.length, reload, toast]);

  useEffect(() => {
    const ch = supabase
      .channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => reload(["claims"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "clinicians" }, () => reload(["clinicians"]))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [reload]);

  useEffect(() => {
    const t = window.setInterval(() => reload(["claims"]), 60000);
    return () => window.clearInterval(t);
  }, [reload]);

  useEffect(() => {
    const f = () => setTab(tabFromHash());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  const claimsFor = useCallback(
    (pid: string) => Object.values(claims).filter((c) => c.practice_id === pid).sort((a, b) => (a.clinician_id === me?.id ? -1 : b.clinician_id === me?.id ? 1 : 0)),
    [claims, me],
  );
  const byId = useCallback((id: string | null | undefined) => clinicians.find((c) => c.id === id), [clinicians]);

  const store = useMemo<Store | null>(
    () =>
      me ? { me, clinicians, practices, claims, taken, claimsFor, settings, reload, toast, openOffice: setOpenId, byId } : null,
    [me, clinicians, practices, claims, taken, claimsFor, settings, reload, toast, byId],
  );

  const signOut = () => supabase.auth.signOut();

  if (me === undefined) return <Gate title="Loading…" />;
  if (me === null)
    return (
      <Gate title="You're not on the roster yet">
        <p>
          You signed in as <b>{session.user.email}</b>. Ask Randi or Ben to add this address in the Admin tab, then
          reload.
        </p>
        <button className="btn" onClick={signOut} type="button">
          Use a different account
        </button>
      </Gate>
    );

  const go = (t: Tab) => {
    location.hash = t;
    setTab(t);
  };

  return (
    <Ctx.Provider value={store}>
      <header className="top">
        <div className="wrap">
          <div className="brand">
            <small>Paris Counseling · team</small>
            <b>Referrals</b>
          </div>
          <nav className="tabs" aria-label="Sections">
            {TABS.filter((t) => !t.admin || me.is_admin).map((t) => (
              <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="who">
            <span>{me.name}</span>
            <button className="btn ghost" onClick={signOut} type="button">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="wrap">
        {tab === "week" && <MyWeek onFind={() => go("offices")} />}
        {tab === "offices" && <Offices />}
        {tab === "team" && me.is_admin && <Team />}
        {tab === "admin" && me.is_admin && <Admin />}
      </main>
      <footer>
        <div className="wrap">
          Practice-level contact data only. Never put client names or health details in this app. Office list from the
          CMS NPI Registry; phone numbers are self-reported by each office, so confirm on the first call.
        </div>
      </footer>
      {openId && <OfficePanel id={openId} onClose={() => setOpenId(null)} />}
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </Ctx.Provider>
  );
}
