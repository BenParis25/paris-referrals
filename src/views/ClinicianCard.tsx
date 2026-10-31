import { useState } from "react";
import { useStore } from "../App";
import { supabase } from "../lib/supabase";
import type { Clinician, Status } from "../lib/types";
import { daysSince, fmtWhen } from "../lib/util";

const LABEL: Record<Status, string> = { open: "Accepting", limited: "Limited", full: "Full" };

export function ClinicianCard({ c, editable }: { c: Clinician; editable: boolean }) {
  const { me } = useStore();
  const [editing, setEditing] = useState(false);
  const age = daysSince(c.updated_at);
  if (editing) return <CardEditor c={c} onDone={() => setEditing(false)} />;
  return (
    <article className={"clin" + (c.id === me.id ? " mine" : "")}>
      <div className="clin-top">
        <div>
          <div className="role">{c.role}</div>
          <h3>{c.name}</h3>
          <div className="muted small">{c.creds}</div>
        </div>
        <span className={"pill " + c.status}>{LABEL[c.status]}</span>
      </div>
      <div className="openline">{c.openings || "No openings listed"}</div>
      <dl className="facts">
        <dt>Where</dt>
        <dd>{c.where_text}</dd>
        <dt>Ages</dt>
        <dd>{c.ages}</dd>
        <dt>Insurance</dt>
        <dd>
          <div className="chips">
            {c.insurance.map((x) => (
              <span className="chip" key={x}>
                {x}
              </span>
            ))}
          </div>
        </dd>
      </dl>
      <div className="fitcols">
        <div className="yes">
          <h4>Good fit</h4>
          <ul>
            {c.fits.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        {c.limits.length > 0 && (
          <div className="no">
            <h4>Before referring</h4>
            <ul>
              {c.limits.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="foot">
        <span className={age > 14 ? "stale" : ""}>
          Updated {fmtWhen(c.updated_at)}
          {age > 14 ? ` · ${age} days ago, still right?` : ""}
        </span>
        {editable && (
          <button className="btn ghost" type="button" onClick={() => setEditing(true)}>
            {c.id === me.id ? "Update my openings" : "Edit card"}
          </button>
        )}
      </div>
    </article>
  );
}

export function CardEditor({ c, onDone }: { c: Clinician; onDone: () => void }) {
  const { reload, toast } = useStore();
  const [f, setF] = useState({
    status: c.status,
    openings: c.openings,
    where_text: c.where_text,
    ages: c.ages,
    insurance: c.insurance.join(", "),
    fits: c.fits.join("\n"),
    limits: c.limits.join("\n"),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("clinicians")
      .update({
        status: f.status,
        openings: f.openings.trim(),
        where_text: f.where_text.trim(),
        ages: f.ages.trim(),
        insurance: f.insurance.split(",").map((x) => x.trim()).filter(Boolean),
        fits: lines(f.fits),
        limits: lines(f.limits),
      })
      .eq("id", c.id);
    setBusy(false);
    if (error) return toast("Couldn't save: " + error.message);
    await reload(["clinicians"]);
    toast("Openings updated");
    onDone();
  };
  const id = (k: string) => `ed-${k}-${c.id}`;
  return (
    <form className="clin mine" onSubmit={save}>
      <h3>{c.name}</h3>
      <label className="field" htmlFor={id("status")}>
        Status
        <select id={id("status")} value={f.status} onChange={set("status")}>
          <option value="open">Accepting</option>
          <option value="limited">Limited</option>
          <option value="full">Full</option>
        </select>
      </label>
      <label className="field" htmlFor={id("open")}>
        Openings in one line (e.g. “4 new-patient slots, Tue and Thu evenings”)
        <input id={id("open")} value={f.openings} onChange={set("openings")} />
      </label>
      <label className="field" htmlFor={id("where")}>
        Where and when
        <input id={id("where")} value={f.where_text} onChange={set("where_text")} />
      </label>
      <label className="field" htmlFor={id("ages")}>
        Ages
        <input id={id("ages")} value={f.ages} onChange={set("ages")} />
      </label>
      <label className="field" htmlFor={id("ins")}>
        Insurance (comma separated)
        <input id={id("ins")} value={f.insurance} onChange={set("insurance")} />
      </label>
      <label className="field" htmlFor={id("fits")}>
        Good fit (one per line)
        <textarea id={id("fits")} value={f.fits} onChange={set("fits")} rows={5} />
      </label>
      <label className="field" htmlFor={id("lim")}>
        Before referring (one per line)
        <textarea id={id("lim")} value={f.limits} onChange={set("limits")} rows={3} />
      </label>
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy}>
          Save
        </button>
        <button className="btn" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
