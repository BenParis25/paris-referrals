import { useMemo, useState } from "react";
import { useStore } from "../App";
import { SEGMENTS } from "../lib/types";
import { firstName } from "../lib/util";

export default function Offices() {
  const { me, practices, claims, byId, openOffice } = useStore();
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");
  const [seg, setSeg] = useState(me.clinical ? "mine" : "all");
  const [show, setShow] = useState<"open" | "all" | "claimed">("open");
  const [indep, setIndep] = useState(false);
  const [limit, setLimit] = useState(60);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const segOrder = (s: string) => (me.is_prescriber && s === "Therapy practice" ? 0 : 1);
    return practices
      .filter((p) => !p.hidden)
      .filter((p) => (area === "all" ? true : p.area === area))
      .filter((p) => (seg === "all" ? true : seg === "mine" ? me.target_segments.includes(p.segment) : p.segment === seg))
      .filter((p) => (indep ? p.system === "Independent" : true))
      .filter((p) => (show === "open" ? !claims[p.id] : show === "claimed" ? !!claims[p.id] : true))
      .filter((p) =>
        t ? (p.practice + " " + p.address + " " + p.city + " " + p.zip + " " + p.clinicians.join(" ")).toLowerCase().includes(t) : true,
      )
      .sort(
        (a, b) =>
          a.priority.localeCompare(b.priority) ||
          segOrder(a.segment) - segOrder(b.segment) ||
          (a.area === b.area ? 0 : a.area === "Greenwood" ? -1 : 1) ||
          b.clinician_count - a.clinician_count ||
          a.practice.localeCompare(b.practice),
      );
  }, [practices, claims, q, area, seg, show, indep, me]);

  const openCount = practices.filter((p) => !p.hidden && !claims[p.id]).length;

  return (
    <>
      <div className="section-head">
        <div>
          <h1>Offices near our offices</h1>
          <p className="lede">
            {openCount} of {practices.filter((p) => !p.hidden).length} offices are unclaimed. Open one, claim it, and it's
            yours to call. Teammates see it's taken.
          </p>
        </div>
      </div>
      <div className="filters">
        <input type="search" id="q" placeholder="Search practice, clinician, street, ZIP…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} aria-label="Search offices" />
        <select id="f-seg" value={seg} onChange={(e) => { setSeg(e.target.value); setLimit(60); }} aria-label="Type">
          {me.clinical && <option value="mine">Types that fit me</option>}
          <option value="all">All types</option>
          {SEGMENTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select id="f-area" value={area} onChange={(e) => { setArea(e.target.value); setLimit(60); }} aria-label="Area">
          <option value="all">Both offices</option>
          <option value="Greenwood">Near Greenwood</option>
          <option value="Lawrence">Near Lawrence</option>
        </select>
        <select id="f-show" value={show} onChange={(e) => { setShow(e.target.value as typeof show); setLimit(60); }} aria-label="Claimed">
          <option value="open">Unclaimed only</option>
          <option value="claimed">Claimed only</option>
          <option value="all">Claimed and unclaimed</option>
        </select>
        <label className="chk">
          <input type="checkbox" id="f-indep" checked={indep} onChange={(e) => setIndep(e.target.checked)} /> Independent only
        </label>
      </div>
      <div className="legend">
        <span><b className="prio A">A</b> Call first: therapy groups and independent offices near Greenwood</span>
        <span><b className="prio B">B</b> Health-system offices near Greenwood; independents near Lawrence</span>
        <span><b className="prio C">C</b> Everything else</span>
      </div>
      <div className="count">{rows.length} offices</div>
      <div className="plist">
        {rows.slice(0, limit).map((p) => {
          const c = claims[p.id];
          const owner = c ? byId(c.clinician_id) : undefined;
          const mineC = c && c.clinician_id === me.id;
          return (
            <button className="prow" type="button" key={p.id} onClick={() => openOffice(p.id)}>
              <b className={"prio " + p.priority}>{p.priority}</b>
              <span style={{ minWidth: 0 }}>
                <span className="seg">{p.segment}</span> <span className="pname">{p.practice}</span>
                <span className="pmeta">
                  <span>
                    {p.address}, {p.city}
                  </span>
                  <span className="mono">{p.phone || "no phone listed"}</span>
                  {p.clinician_count > 0 && <span>{p.clinician_count} clinician{p.clinician_count > 1 ? "s" : ""}</span>}
                  {p.system !== "Independent" && <span>{p.system}</span>}
                </span>
              </span>
              {c ? (
                <span className={"st" + (mineC ? "" : " other")} data-s={mineC ? c.status : undefined}>
                  {mineC ? c.status : `${firstName(owner?.name || "Teammate")} · ${c.status}`}
                </span>
              ) : (
                <span className="st">Open</span>
              )}
            </button>
          );
        })}
      </div>
      {rows.length > limit && (
        <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
          <button className="btn" type="button" onClick={() => setLimit(limit + 60)}>
            Show more
          </button>
        </div>
      )}
    </>
  );
}
