import type { Claim, Clinician, Practice, Settings } from "./types";

export type Format = "email" | "fax" | "call";

const first = (n: string) => n.split(" ")[0];
const today = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const roleTail = (c: Clinician) => (c.role.split("·")[1] || c.role).trim();
const roleHead = (c: Clinician) => c.role.split("·")[0].trim().toLowerCase();
const listJoin = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
const lowerFirst = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const clientWord = (p: Practice) => (p.segment === "Therapy practice" ? "clients" : "patients");
const officeFor = (p: Practice, s: Settings) => (p.area === "Lawrence" ? s.lawrence : s.greenwood);
const officeShort = (p: Practice) =>
  p.area === "Lawrence" ? "on Otis Ave by Fort Harrison" : "on Smith Valley Road in Greenwood";

function treats(c: Clinician) {
  return c.fits.filter((f) => !/^(CBT|ACT)\b|solution-focused|mindfulness/i.test(f));
}

function intro(c: Clinician, p: Practice): string {
  const t = treats(c).slice(0, 3).map(lowerFirst);
  if (p.segment === "Therapy practice") {
    return c.is_prescriber
      ? "If you have clients who might benefit from a medication evaluation, I can manage their medication while they keep working with you. I coordinate directly with the client's therapist, so nobody has to switch counselors."
      : `If your waitlist is running long, I'd be glad to take referrals for ${listJoin(t)}.`;
  }
  if (p.segment === "Pediatrics") {
    return c.is_prescriber
      ? "When a child or teen in your practice needs psychiatric medication management beyond what fits in a well visit, I'd like to be an easy next step."
      : `When a teen in your practice needs ongoing therapy for ${listJoin(t)}, I'd like to be an easy next step.`;
  }
  if (p.segment === "OB/GYN") {
    return c.is_prescriber
      ? "When a patient screens positive for depression or anxiety and needs a psychiatric medication evaluation, I'd like to be an easy place to send her."
      : "When a patient screens positive for depression or anxiety and needs someone to talk to, I'd like to be an easy place to send her.";
  }
  return c.is_prescriber
    ? "When a patient's depression, anxiety, ADHD or mood symptoms need more than a primary care visit can give them, or their current medication isn't working, I'd like to be an easy next step."
    : `When a patient needs ongoing therapy for ${listJoin(t)}, I'd like to be an easy next step.`;
}

function selfBlock(c: Clinician, p: Practice) {
  const ages = p.segment === "Pediatrics" && !c.is_prescriber ? "Teens" : c.ages;
  const lines = [
    `• ${c.openings}${c.status === "limited" ? " (limited availability)" : ""}`,
    `• Ages: ${ages}`,
    `• Where: ${c.where_text}`,
    `• Good fit for: ${c.fits.join("; ")}`,
    `• Insurance: ${c.insurance.join(", ")}`,
  ];
  const lim = c.limits.filter((x) => !/comment box/i.test(x));
  if (lim.length) lines.push(`• Good to know before referring: ${lim.map(lowerFirst).join("; ")}.`);
  return lines.join("\n");
}

function colleagueBlock(c: Clinician) {
  return `${c.name}, ${c.creds} (${roleTail(c).toLowerCase()}): ${c.openings.toLowerCase()}. ${c.ages}. ${treats(c)
    .slice(0, 4)
    .join(", ")}. Takes ${c.insurance.filter((i) => i !== "Self-pay").join(", ")}.`;
}

export function subjectFor(me: Clinician, p: Practice) {
  return me.is_prescriber
    ? `Psychiatric medication management openings for your ${clientWord(p)}`
    : `Therapy openings for your ${clientWord(p)}`;
}

export function buildLetter(
  fmt: Format,
  me: Clinician,
  p: Practice,
  claim: Partial<Claim>,
  colleagues: Clinician[],
  s: Settings,
): { subject: string; body: string } {
  const subject = subjectFor(me, p);
  const contact = (claim.contact_name || "").trim();
  const sign = [`${me.name}${me.creds ? ", " + me.creds : ""}`, `${me.role.split("·")[0].trim()}, Paris Counseling`, `${s.phone} · ${s.email}`, "pariscounselingllc.org"];
  const how = `To refer: call ${s.phone}${s.fax ? `, fax ${s.fax}` : ""}, or have the ${clientWord(p).slice(0, -1)} request an appointment at ${s.request_url}. Mention my name${colleagues.length ? " or my colleague's" : ""} so it comes straight to ${colleagues.length ? "the right person" : "me"}.`;

  if (fmt === "call") {
    const lines = [
      "Ask for: the office manager or whoever handles behavioral health referrals.",
      "",
      `"Hi, this is ${me.name}. I'm a ${roleHead(me)} at Paris Counseling, the practice ${officeShort(p)}. Who handles mental health referrals for your ${p.segment === "Therapy practice" ? "clinicians" : "providers"}?"`,
      "",
      me.is_prescriber
        ? `"I'm taking new patients for psychiatric medication management. I see ${me.ages.toLowerCase()} for ${listJoin(treats(me).slice(0, 4).map(lowerFirst))}, and I take ${me.insurance.filter((i) => i !== "Self-pay").join(", ")}.${p.segment === "Therapy practice" ? " Clients keep their therapist with you, and I coordinate with them." : ""}"`
        : `"I have openings for therapy. I see ${me.ages.toLowerCase()} for ${listJoin(treats(me).slice(0, 4).map(lowerFirst))}, and I take ${me.insurance.filter((i) => i !== "Self-pay").join(", ")}."`,
      ...colleagues.map((c) => `"My colleague ${c.name} also has openings: ${c.openings.toLowerCase()}, ${c.ages.toLowerCase()}."`),
      "",
      `"Could I ${claim.contact_fax || claim.contact_email ? "send" : "fax or email"} you a one-page referral sheet? Who should it go to?"`,
      "",
      "Write down: contact name, their email or fax, and the best day to drop off referral info.",
    ];
    const lim = me.limits.filter((x) => !/comment box/i.test(x));
    if (lim.length) lines.push("", `If they ask about limits: ${lim.map(lowerFirst).join("; ")}.`);
    return { subject, body: lines.join("\n") };
  }

  const greet = contact ? `Hi ${first(contact)},` : `Hello ${p.practice} team,`;
  const body = [
    greet,
    "",
    `I'm ${me.name}, ${me.creds ? me.creds + ", " : ""}a ${roleHead(me)} at Paris Counseling (${officeFor(p, s)}). I have openings right now and wanted your office to have a direct line for referrals.`,
    "",
    intro(me, p),
    "",
    selfBlock(me, p),
    "",
    ...(colleagues.length ? ["My colleagues also have openings:", ...colleagues.map((c) => "• " + colleagueBlock(c)), ""] : []),
    how,
    "",
    `I'm happy to drop off referral info or set up a quick call. Thank you for everything you do for your ${clientWord(p)}.`,
    "",
    ...sign,
  ].join("\n");

  if (fmt === "fax") {
    const head = [
      "FAX",
      `Date: ${today()}`,
      `To: ${contact ? contact + ", " : ""}${p.practice}`,
      `Fax: ${claim.contact_fax || p.fax || "__________"}`,
      `Phone: ${p.phone}`,
      `From: ${me.name}, Paris Counseling`,
      `Phone: ${s.phone}${s.fax ? ` · Fax: ${s.fax}` : ""}`,
      "Pages: 1",
      `Re: ${subject}`,
      "──────────────────────────────",
      "",
    ].join("\n");
    return {
      subject,
      body: head + body.replace(greet, contact ? `Dear ${contact},` : `To the providers and staff of ${p.practice},`) + "\n\nThis fax contains no patient information.",
    };
  }
  return { subject, body };
}

export function teamNote(clinicians: Clinician[], s: Settings) {
  const lines = [`Openings as of ${today()}`, ""];
  for (const c of clinicians) {
    if (c.status === "full") {
      lines.push(`${c.name}, ${c.creds}: full right now.`, "");
      continue;
    }
    lines.push(`${c.name}, ${c.creds} (${roleHead(c)}): ${c.openings}${c.status === "limited" ? " (limited)" : ""}`);
    lines.push(`  Where: ${c.where_text} · Ages: ${c.ages}`);
    lines.push(`  Good fit: ${c.fits.join("; ")}`);
    if (c.limits.length) lines.push(`  Before referring: ${c.limits.join("; ")}`);
    lines.push(`  Insurance: ${c.insurance.join(", ")}`, "");
  }
  const rx = clinicians.find((c) => c.is_prescriber && c.status !== "full");
  if (rx)
    lines.push(
      `If you have a client who might benefit from a medication evaluation, ${first(rx.name)} can see them while they keep working with you. Send them through the front desk with ${first(rx.name)}'s name in the note.`,
      "",
    );
  lines.push(`Referrals: ${s.phone}${s.fax ? " · fax " + s.fax : ""} · ${s.email}`);
  return lines.join("\n");
}
