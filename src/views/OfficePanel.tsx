import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../App";
import { supabase } from "../lib/supabase";
import { buildLetter, subjectFor, type Format } from "../lib/letters";
import { CLAIM_STATUSES, type Activity, type ClaimStatus } from "../lib/types";
import { copyText, fmtWhen, firstName } from "../lib/util";

export default function OfficePanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { me, practices, claims, taken, clinicians, settings, byId, reload, toast } = useStore();
  const p = practices.find((x) => x.id === id);
  const claim = claims[id];
  const owner = claim ? byId(claim.clinician_id) : undefined;
  const mine = !!claim && claim.clinician_id === me.id;
  const canEdit = mine || me.is_admin;
  const [log, setLog] = useState<Activity[]>([]);
  const [form, setForm] = useState({ contact_name: "", contact_email: "", contact_fax: "", next_date: "", notes: "" });
  const [fmt, setFmt] = useState<Format>("email");
  const [colleagueIds, setColleagueIds] = useState<string[]>([]);
  const [sender, setSender] = useState<string>(me.clinical ? me.id : "");
  const letterRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setForm({
      contact_name: claim?.contact_name || "",
      contact_email: claim?.contact_email || "",
      contact_fax: claim?.contact_fax || "",
      next_date: claim?.next_date || "",
      notes: claim?.notes || "",
    });
  }, [claim?.practice_id, claim?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLog = () =>
    supabase
      .from("activity")
      .select("*")
      .eq("practice_id", id)
      .order("at", { ascending: false })
      .limit(20)
      .then(({ data }) => setLog((data || []) as Activity[]));
  useEffect(() => {
    loadLog();
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openClinicians = clinicians.filter((c) => c.active && c.clinical && c.status !== "full");
  const senderC = openClinicians.find((c) => c.id === (sender || owner?.id || "")) || (me.clinical ? me : openClinicians[0]);
  const colleagues = openClinicians.filter((c) => c.id !== senderC?.id && colleagueIds.includes(c.id));
  const letter = useMemo(
    () => (p && senderC ? buildLetter(fmt, senderC, p, form, colleagues, settings) : { subject: "", body: "" }),
    [fmt, senderC, p, form, colleagues, settings],
  );

  if (!p) return null;

  const logIt = async (kind: string, body: string) => {
    await supabase.from("activity").insert({ practice_id: id, clinician_id: me.id, kind, body });
    loadLog();
  };

  const claimIt = async () => {
    const { error } = await supabase.from("claims").insert({ practice_id: id, clinician_id: me.id });
    if (error) {
      await reload(["claims"]);
      return toast(error.code === "23505" ? "A teammate just claimed this office." : "Couldn't claim: " + error.message);
    }
    await logIt("claimed", "Claimed");
    await reload(["claims"]);
    toast("It's yours. Call them.");
  };
  const release = async () => {
    const { error } = await supabase.from("claims").delete().eq("practice_id", id);
    if (error) return toast("Couldn't release: " + error.message);
    await logIt("released", `Released by ${me.name}`);
    await reload(["claims"]);
    toast("Released back to the open list");
  };
  const setStatus = async (s: ClaimStatus) => {
    if (!claim || claim.status === s) return;
    const { error } = await supabase.from("claims").update({ status: s }).eq("practice_id", id);
    if (error) return toast("Couldn't save: " + error.message);
    await logIt("status", `${claim.status} → ${s}`);
    await reload(["claims"]);
    toast(s);
  };
  const saveDetails = async () => {
    const { error } = await supabase
      .from("claims")
      .update({ ...form, next_date: form.next_date || null })
      .eq("practice_id", id);
    if (error) return toast("Couldn't save: " + error.message);
    await reload(["claims"]);
    toast("Saved");
  };
  const reassign = async (to: string) => {
    if (!claim || to === claim.clinician_id) return;
    const { error } = await supabase.from("claims").update({ clinician_id: to }).eq("practice_id", id);
    if (error) return toast("Couldn't reassign: " + error.message);
    await logIt("note", `Reassigned to ${byId(to)?.name}`);
    await reload(["claims"]);
    toast("Reassigned");
  };
  const copyLetter = async (markSent: boolean) => {
    const ok = await copyText(letter.body, letterRef.current);
    toast(ok ? "Copied" : "Press Ctrl/Cmd+C to copy");
    if (markSent && claim) {
      await logIt("letter", `${fmt === "fax" ? "Fax" : "Email"} letter sent`);
      if (claim.status === "Claimed" || claim.status === "Called") await setStatus("Letter sent");
    }
  };
  const mailto =
    form.contact_email && fmt === "email"
      ? `mailto:${encodeURIComponent(form.contact_email)}?subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`
      : "";
  const maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(`${p.address}, ${p.city}, IN ${p.zip}`);
  const fitsMe = me.target_segments.includes(p.segment);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="panel" role="dialog" aria-modal="true" aria-labelledby="p-title">
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            <span className="seg">
              {p.segment} · Priority {p.priority} · near {p.area}
            </span>
            <h2 id="p-title">{p.practice}</h2>
          </div>
          <button ref={closeRef} className="btn x" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="panel-body">
          <section className="block">
            <h3>Office</h3>
            <dl className="kv">
              <dt>Address</dt>
              <dd>
                {p.address}, {p.city}, IN {p.zip} ·{" "}
                <a href={maps} target="_blank" rel="noopener noreferrer">
                  Map
                </a>
              </dd>
              <dt>Phone</dt>
              <dd>
                {p.phone ? (
                  <a className="mono" href={"tel:" + p.phone.replace(/\D/g, "")}>
                    {p.phone}
                  </a>
                ) : (
                  "not listed"
                )}
              </dd>
              <dt>Owner</dt>
              <dd>
                {p.system}
                {p.system === "Multiple offices"
                  ? ". Several practices share this building, so ask the front desk which office you've reached."
                  : p.system !== "Independent"
                    ? ". Health-system offices often refer inside their network; ask for the office manager."
                    : ""}
              </dd>
              {p.clinician_count > 0 && (
                <>
                  <dt>Clinicians</dt>
                  <dd>{p.clinicians.join("; ")}</dd>
                </>
              )}
              {p.taxonomy && (
                <>
                  <dt>Listed as</dt>
                  <dd>{p.taxonomy}</dd>
                </>
              )}
              <dt>NPI</dt>
              <dd className="mono">{p.npis.join(" · ")}</dd>
            </dl>
          </section>

          {!claim && taken.has(id) && (
            <p className="notice">Another therapist is already working this office. Pick a different one so nobody gets called twice.</p>
          )}

          {!claim && !taken.has(id) && (
            <section className="claimbox">
              <b>Nobody owns this office yet.</b>
              <span className="small">
                Claim it and it's yours to call. Other therapists will see it's taken, but not your name or notes.
                {!fitsMe && me.clinical ? " Heads up: this type of office isn't on your usual list." : ""}
              </span>
              <div className="row">
                <button className="btn primary" type="button" onClick={claimIt}>
                  Claim this office
                </button>
              </div>
            </section>
          )}

          {claim && !canEdit && (
            <p className="notice">
              {owner?.name || "A teammate"} owns this office ({claim.status}, last update {fmtWhen(claim.updated_at)}). Ask
              them before you reach out, or ask an admin to reassign it.
            </p>
          )}

          {claim && canEdit && (
            <section className="block">
              <h3>Outreach{!mine && owner ? ` · owned by ${owner.name}` : ""}</h3>
              <div className="statusbar" role="group" aria-label="Status">
                {CLAIM_STATUSES.map((s) => (
                  <button key={s} type="button" aria-pressed={claim.status === s} onClick={() => setStatus(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="grid2" style={{ marginTop: 12 }}>
                <label className="field" htmlFor="t-name">
                  Contact name
                  <input id="t-name" value={form.contact_name} placeholder="Office manager, referral coordinator…" onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                </label>
                <label className="field" htmlFor="t-email">
                  Contact email
                  <input id="t-email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
                </label>
                <label className="field" htmlFor="t-fax">
                  Their fax
                  <input id="t-fax" value={form.contact_fax} onChange={(e) => setForm({ ...form, contact_fax: e.target.value })} />
                </label>
                <label className="field" htmlFor="t-next">
                  Follow up on
                  <input id="t-next" type="date" value={form.next_date} onChange={(e) => setForm({ ...form, next_date: e.target.value })} />
                </label>
                <label className="field wide" htmlFor="t-notes">
                  Notes about the office (private to you and admins; never client names)
                  <textarea id="t-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </label>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" type="button" onClick={saveDetails}>
                  Save details
                </button>
                <button className="btn ghost danger" type="button" onClick={release}>
                  Release office
                </button>
                {me.is_admin && (
                  <label className="field" htmlFor="t-owner" style={{ marginLeft: "auto" }}>
                    Owner
                    <select id="t-owner" value={claim.clinician_id} onChange={(e) => reassign(e.target.value)}>
                      {clinicians
                        .filter((c) => c.active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            </section>
          )}

          {claim && canEdit && senderC && (
            <section className="block">
              <h3>Letter in {mine && me.clinical ? "your" : firstName(senderC.name) + "'s"} name</h3>
              <div className="row" style={{ marginBottom: 10, gap: 14 }}>
                <div className="seg-ctl" role="group" aria-label="Format">
                  {(
                    [
                      ["email", "Email"],
                      ["fax", "Fax letter"],
                      ["call", "Call script"],
                    ] as [Format, string][]
                  ).map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={fmt === k} onClick={() => setFmt(k)}>
                      {l}
                    </button>
                  ))}
                </div>
                {(!me.clinical || !mine) && (
                  <label className="chk">
                    From
                    <select className="input" style={{ width: "auto" }} value={senderC.id} onChange={(e) => setSender(e.target.value)} aria-label="Letter from">
                      {openClinicians.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {openClinicians.filter((c) => c.id !== senderC.id).length > 0 && (
                <div className="row small" style={{ marginBottom: 10 }}>
                  <span className="muted">Also mention:</span>
                  {openClinicians
                    .filter((c) => c.id !== senderC.id)
                    .map((c) => (
                      <label className="chk" key={c.id}>
                        <input
                          type="checkbox"
                          checked={colleagueIds.includes(c.id)}
                          onChange={(e) =>
                            setColleagueIds(e.target.checked ? [...colleagueIds, c.id] : colleagueIds.filter((x) => x !== c.id))
                          }
                        />
                        {c.name}
                      </label>
                    ))}
                </div>
              )}
              {fmt === "email" && <p className="small muted" style={{ margin: "0 0 6px" }}>Subject: {subjectFor(senderC, p)}</p>}
              <textarea ref={letterRef} className="letter" value={letter.body} readOnly aria-label="Generated letter" />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" type="button" onClick={() => copyLetter(false)}>
                  Copy
                </button>
                {fmt !== "call" && (
                  <button className="btn" type="button" onClick={() => copyLetter(true)}>
                    Copy and log as sent
                  </button>
                )}
                {mailto && (
                  <a className="btn ghost" href={mailto} onClick={() => logIt("letter", "Email letter opened in mail app")}>
                    Open in Gmail / mail app
                  </a>
                )}
              </div>
            </section>
          )}

          {log.length > 0 && (
            <section className="block">
              <h3>History</h3>
              <ul className="log">
                {log.map((l) => (
                  <li key={l.id}>
                    <time>{fmtWhen(l.at)}</time> {l.body}
                    {l.clinician_id ? ` · ${byId(l.clinician_id)?.name || "teammate"}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
