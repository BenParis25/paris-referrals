import { useEffect, useMemo, useState } from "react";
import { useStore } from "../App";
import { supabase } from "../lib/supabase";
import { CLAIM_STATUSES, SEGMENTS, type Clinician, type Settings } from "../lib/types";
import { daysSince } from "../lib/util";
import { importOffices } from "../lib/importOffices";

export default function Admin() {
  const { clinicians, claims, settings, reload, toast, openOffice, practices } = useStore();
  const [touches, setTouches] = useState<Record<string, number>>({});

  useEffect(() => {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    supabase
      .from("activity")
      .select("clinician_id")
      .gte("at", since)
      .in("kind", ["status", "letter", "note"])
      .range(0, 4999)
      .then(({ data }) => {
        const m: Record<string, number> = {};
        (data || []).forEach((r: { clinician_id: string | null }) => r.clinician_id && (m[r.clinician_id] = (m[r.clinician_id] || 0) + 1));
        setTouches(m);
      });
  }, [claims]);

  const board = useMemo(() => {
    return clinicians
      .filter((c) => c.active && c.clinical)
      .map((c) => {
        const mine = Object.values(claims).filter((x) => x.clinician_id === c.id);
        const by: Record<string, number> = {};
        CLAIM_STATUSES.forEach((s) => (by[s] = mine.filter((x) => x.status === s).length));
        const stale = mine.filter((x) => daysSince(x.updated_at) > 21 && !["Referring", "Not a fit"].includes(x.status)).length;
        return { c, total: mine.length, by, stale };
      });
  }, [clinicians, claims]);

  const stalest = useMemo(
    () =>
      Object.values(claims)
        .filter((x) => !["Referring", "Not a fit"].includes(x.status) && daysSince(x.updated_at) > 21)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        .slice(0, 10),
    [claims],
  );
  const pName = (id: string) => practices.find((p) => p.id === id)?.practice || id;
  const cName = (id: string) => clinicians.find((c) => c.id === id)?.name || "—";

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <section style={{ display: "grid", gap: 10 }}>
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div>
            <h1>Outreach scoreboard</h1>
            <p className="lede">Who's working their offices. Touches count status changes, letters and notes in the last 7 days.</p>
          </div>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Clinician</th>
                <th className="num">Offices</th>
                <th className="num">7-day touches</th>
                {CLAIM_STATUSES.map((s) => (
                  <th className="num" key={s}>
                    {s}
                  </th>
                ))}
                <th className="num">Stale</th>
              </tr>
            </thead>
            <tbody>
              {board.map(({ c, total, by, stale }) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="num">{total}</td>
                  <td className="num">{touches[c.id] || 0}</td>
                  {CLAIM_STATUSES.map((s) => (
                    <td className="num" key={s}>
                      {by[s] || ""}
                    </td>
                  ))}
                  <td className="num">{stale ? <span className="stale">{stale}</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stalest.length > 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            <h2>Going stale</h2>
            <p className="small muted" style={{ margin: 0 }}>
              No update in 3+ weeks. These release automatically at 30 days. Open one to nudge, reassign or release.
            </p>
            <div className="plist">
              {stalest.map((x) => (
                <button key={x.practice_id} className="prow" type="button" onClick={() => openOffice(x.practice_id)}>
                  <b className="prio C">{daysSince(x.updated_at)}</b>
                  <span style={{ minWidth: 0 }}>
                    <span className="pname">{pName(x.practice_id)}</span>
                    <span className="pmeta">
                      <span>{cName(x.clinician_id)}</span>
                      <span>days since update</span>
                    </span>
                  </span>
                  <span className="st" data-s={x.status}>
                    {x.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <Roster clinicians={clinicians} reload={reload} toast={toast} />
      <OfficeImport count={practices.length} reload={reload} toast={toast} />
      <SettingsForm settings={settings} reload={reload} toast={toast} />
    </div>
  );
}

function Roster({
  clinicians,
  reload,
  toast,
}: {
  clinicians: Clinician[];
  reload: (w?: ("clinicians" | "practices" | "claims" | "settings")[]) => Promise<void>;
  toast: (t: string) => void;
}) {
  const [draft, setDraft] = useState({ name: "", email: "", creds: "", role: "Therapist · individual therapy" });
  const patch = async (c: Clinician, fields: Partial<Clinician>) => {
    const { error } = await supabase.from("clinicians").update(fields).eq("id", c.id);
    if (error) return toast(error.message.includes("lower") ? "That email is already on the roster." : "Couldn't save: " + error.message);
    await reload(["clinicians"]);
    toast("Saved");
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const { error } = await supabase.from("clinicians").insert({
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase() || null,
      creds: draft.creds.trim(),
      role: draft.role.trim(),
      openings: "Accepting new clients",
    });
    if (error) return toast("Couldn't add: " + error.message);
    setDraft({ name: "", email: "", creds: "", role: "Therapist · individual therapy" });
    await reload(["clinicians"]);
    toast("Added. They can sign in now and fill in their card.");
  };
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div>
        <h2>Roster</h2>
        <p className="small muted" style={{ margin: "2px 0 0" }}>
          Only people listed here with an email can sign in. Clinical = has an openings card. Prescriber changes the letter
          wording. Targets set which office types show as “fits me”.
        </p>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Sign-in email</th>
              <th>Clinical</th>
              <th>Prescriber</th>
              <th>Admin</th>
              <th>Active</th>
              <th>Targets</th>
            </tr>
          </thead>
          <tbody>
            {clinicians.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.name}</b>
                  <div className="small muted">{c.creds}</div>
                </td>
                <td>
                  <input
                    className="input"
                    type="email"
                    id={"em-" + c.id}
                    defaultValue={c.email || ""}
                    placeholder="name@pariscounselingllc.org"
                    onBlur={(e) => {
                      const v = e.target.value.trim().toLowerCase() || null;
                      if (v !== (c.email || null)) patch(c, { email: v });
                    }}
                  />
                </td>
                {(["clinical", "is_prescriber", "is_admin", "active"] as const).map((k) => (
                  <td key={k}>
                    <input type="checkbox" checked={c[k]} onChange={(e) => patch(c, { [k]: e.target.checked } as Partial<Clinician>)} aria-label={k} />
                  </td>
                ))}
                <td>
                  <div className="chips">
                    {SEGMENTS.map((s) => (
                      <label key={s} className="chk" style={{ whiteSpace: "nowrap" }}>
                        <input
                          type="checkbox"
                          checked={c.target_segments.includes(s)}
                          onChange={(e) =>
                            patch(c, {
                              target_segments: e.target.checked ? [...c.target_segments, s] : c.target_segments.filter((x) => x !== s),
                            })
                          }
                        />
                        {s}
                      </label>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="panelbox" onSubmit={add}>
        <h3 style={{ fontSize: 15 }}>Add a teammate</h3>
        <div className="grid2">
          <label className="field" htmlFor="n-name">
            Name
            <input id="n-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          </label>
          <label className="field" htmlFor="n-email">
            Google sign-in email
            <input id="n-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </label>
          <label className="field" htmlFor="n-creds">
            Credentials
            <input id="n-creds" value={draft.creds} placeholder="LCSW" onChange={(e) => setDraft({ ...draft, creds: e.target.value })} />
          </label>
          <label className="field" htmlFor="n-role">
            Role line (“Title · what they do”)
            <input id="n-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <button className="btn primary" type="submit">
            Add to roster
          </button>
        </div>
      </form>
    </section>
  );
}

function SettingsForm({
  settings,
  reload,
  toast,
}: {
  settings: Settings;
  reload: (w?: ("clinicians" | "practices" | "claims" | "settings")[]) => Promise<void>;
  toast: (t: string) => void;
}) {
  const [f, setF] = useState(settings);
  useEffect(() => setF(settings), [settings]);
  const fields: [keyof Settings, string][] = [
    ["phone", "Main phone"],
    ["fax", "Fax for referrals"],
    ["email", "Referral email"],
    ["request_url", "Online appointment request"],
    ["greenwood", "Greenwood address"],
    ["lawrence", "Lawrence address"],
  ];
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("settings").update(f).eq("id", 1);
    if (error) return toast("Couldn't save: " + error.message);
    await reload(["settings"]);
    toast("Referral details saved");
  };
  return (
    <form className="panelbox" onSubmit={save}>
      <div>
        <h2>How referrals reach us</h2>
        <p className="small muted" style={{ margin: "2px 0 0" }}>
          Printed at the bottom of every letter. Add a fax number: most medical offices refer by fax.
        </p>
      </div>
      <div className="grid2">
        {fields.map(([k, l]) => (
          <label className="field" key={k} htmlFor={"s-" + k}>
            {l}
            <input id={"s-" + k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="row">
        <button className="btn primary" type="submit">
          Save referral details
        </button>
      </div>
    </form>
  );
}

function OfficeImport({
  count,
  reload,
  toast,
}: {
  count: number;
  reload: (w?: ("clinicians" | "practices" | "claims" | "settings")[]) => Promise<void>;
  toast: (t: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const run = async () => {
    const r = await importOffices(setBusy);
    setBusy("");
    if (!r.ok) return toast("Import stopped: " + r.error);
    await reload(["practices"]);
    toast(`Office list loaded: ${r.count} offices`);
  };
  return (
    <section className="panelbox">
      <div>
        <h2>Office list</h2>
        <p className="small muted" style={{ margin: "2px 0 0" }}>
          {count} offices in the app. The bundled NPI pull (Oct 31, 2026) has 551. Loading it again updates names, phones and
          addresses but never touches claims, notes or the fax numbers you've added.
        </p>
      </div>
      <div className="row">
        <button className="btn" type="button" onClick={run} disabled={!!busy}>
          {busy || "Load the NPI office list"}
        </button>
      </div>
    </section>
  );
}
