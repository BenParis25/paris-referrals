import { useEffect, useMemo, useState } from "react";
import { useStore } from "../App";
import { supabase } from "../lib/supabase";
import type { Claim } from "../lib/types";
import { daysSince, fmtDate, isoToday, firstName } from "../lib/util";
import { ClinicianCard } from "./ClinicianCard";

const ORDER = ["Meeting set", "Letter sent", "Called", "Claimed", "Referring", "Not a fit"];

export default function MyWeek({ onFind }: { onFind: () => void }) {
  const { me, claims, practices, openOffice } = useStore();
  const [touches, setTouches] = useState<number | null>(null);

  const mine = useMemo(() => Object.values(claims).filter((c) => c.clinician_id === me.id), [claims, me.id]);
  const pById = useMemo(() => Object.fromEntries(practices.map((p) => [p.id, p])), [practices]);
  const today = isoToday();
  const due = mine
    .filter((c) => c.next_date && c.next_date <= today && c.status !== "Not a fit")
    .sort((a, b) => (a.next_date || "").localeCompare(b.next_date || ""));
  const untouched = mine.filter((c) => c.status === "Claimed");
  const referring = mine.filter((c) => c.status === "Referring").length;

  useEffect(() => {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    supabase
      .from("activity")
      .select("id", { count: "exact", head: true })
      .eq("clinician_id", me.id)
      .gte("at", since)
      .in("kind", ["status", "letter", "note"])
      .then(({ count }) => setTouches(count ?? 0));
  }, [me.id, claims]);

  const sorted = [...mine].sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.next_date || "9").localeCompare(b.next_date || "9"),
  );

  const Row = ({ c }: { c: Claim }) => {
    const p = pById[c.practice_id];
    if (!p) return null;
    const stale = daysSince(c.updated_at) > 21 && c.status !== "Referring" && c.status !== "Not a fit";
    return (
      <button className="prow" type="button" onClick={() => openOffice(p.id)}>
        <b className={"prio " + p.priority}>{p.priority}</b>
        <span style={{ minWidth: 0 }}>
          <span className="seg">{p.segment}</span> <span className="pname">{p.practice}</span>
          <span className="pmeta">
            <span className="mono">{p.phone || "no phone listed"}</span>
            {c.contact_name && <span>Contact: {c.contact_name}</span>}
            {c.next_date && <span>Follow up {fmtDate(c.next_date)}</span>}
            {stale && <span className="stale">No update in {daysSince(c.updated_at)} days</span>}
          </span>
        </span>
        <span className="st" data-s={c.status}>
          {c.status}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="section-head">
        <div>
          <h1>Hi {firstName(me.name)}</h1>
          <p className="lede">
            {me.clinical
              ? "Keep your card current, work your offices, and log every call so nobody doubles up."
              : "You're signed in as staff. Use Team openings and Admin to keep everyone moving."}
          </p>
        </div>
        <button className="btn primary" type="button" onClick={onFind}>
          Find offices to call
        </button>
      </div>

      <div className="stats">
        <div>
          <b>{mine.length}</b>
          <span>Offices you own</span>
        </div>
        <div>
          <b>{touches ?? "–"}</b>
          <span>Touches in the last 7 days</span>
        </div>
        <div>
          <b>{due.length}</b>
          <span>Follow-ups due</span>
        </div>
        <div>
          <b>{referring}</b>
          <span>Now referring</span>
        </div>
      </div>

      <div className={me.clinical ? "cols" : ""}>
        <section style={{ display: "grid", gap: 18, minWidth: 0 }}>
          {due.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <h2>Due today</h2>
              <div className="plist">{due.map((c) => <Row key={c.practice_id} c={c} />)}</div>
            </div>
          )}
          {untouched.length > 0 && (
            <p className="notice warn">
              {untouched.length} claimed {untouched.length === 1 ? "office hasn't" : "offices haven't"} been called yet.
              Claims with no activity for 30 days go back to the open list.
            </p>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            <h2>Your offices</h2>
            {sorted.length ? (
              <div className="plist">{sorted.map((c) => <Row key={c.practice_id} c={c} />)}</div>
            ) : (
              <div className="empty">
                <p style={{ marginTop: 0 }}>You haven't claimed any offices yet.</p>
                <p className="small">
                  Start with five A-priority offices near your office. Claiming one keeps your teammates from calling it.
                </p>
                <button className="btn primary" type="button" onClick={onFind}>
                  Find offices
                </button>
              </div>
            )}
          </div>
        </section>
        {me.clinical && (
          <section style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <h2>Your openings card</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Every letter you send pulls from this card. Update it the day your caseload changes.
            </p>
            <ClinicianCard c={me} editable />
          </section>
        )}
      </div>
    </>
  );
}
