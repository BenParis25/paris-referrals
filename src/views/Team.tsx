import { useRef } from "react";
import { useStore } from "../App";
import { teamNote } from "../lib/letters";
import { copyText } from "../lib/util";
import { ClinicianCard } from "./ClinicianCard";

export default function Team() {
  const { me, clinicians, settings, toast } = useStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const cards = clinicians.filter((c) => c.active && c.clinical);
  const note = teamNote(cards, settings);
  return (
    <>
      <div className="section-head">
        <div>
          <h1>Who can take new clients</h1>
          <p className="lede">
            Everyone's openings in one place. Before you send a client to the waitlist, check here: a teammate down the hall may
            have the slot.
          </p>
        </div>
      </div>
      {cards.length ? (
        <div className="clin-grid">
          {cards.map((c) => (
            <ClinicianCard key={c.id} c={c} editable={c.id === me.id || me.is_admin} />
          ))}
        </div>
      ) : (
        <div className="empty">No clinician cards yet. An admin can add them in the Admin tab.</div>
      )}
      <section className="panelbox" style={{ marginTop: 24 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Team note</h2>
            <p className="small muted" style={{ margin: "2px 0 0" }}>
              Ready to paste into an email or text to the team or front desk. Built from the cards above.
            </p>
          </div>
          <button
            className="btn primary"
            type="button"
            onClick={async () => toast((await copyText(note, ref.current)) ? "Copied" : "Press Ctrl/Cmd+C to copy")}
          >
            Copy note
          </button>
        </div>
        <textarea ref={ref} className="letter" style={{ minHeight: 220 }} readOnly value={note} aria-label="Team note" />
      </section>
    </>
  );
}
