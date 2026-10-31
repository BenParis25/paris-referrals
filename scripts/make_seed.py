"""Builds supabase/seed/*.sql from data/practices.json plus the starting roster.
Run: python3 scripts/make_seed.py
"""
import json, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
practices = json.loads((root / "data" / "practices.json").read_text())
out = root / "supabase" / "seed"
out.mkdir(parents=True, exist_ok=True)

def q(s):
    return "'" + str(s if s is not None else "").replace("'", "''") + "'"

def arr(xs):
    return "ARRAY[" + ",".join(q(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"

ALL = ["Therapy practice", "Primary care", "Internal medicine", "Pediatrics", "OB/GYN"]
MED = ["Primary care", "Internal medicine", "Pediatrics", "OB/GYN"]

roster = [
    dict(email=None, name="Andrew Slaton", creds="MSN, APRN, PMHNP-BC",
         role="Psychiatric nurse practitioner · medication management", is_prescriber=True,
         status="open", openings="Accepting new patients",
         where_text="Greenwood in person; telehealth anywhere in Indiana", ages="Children, teens and adults",
         insurance=["Anthem", "Blue Cross Blue Shield", "Optum", "UnitedHealthcare", "UMR", "Aetna", "Self-pay"],
         fits=["Depression and anxiety", "PTSD", "Bipolar disorder and mood stabilizers",
               "ADHD, stimulant and non-stimulant", "Patients whose current medication isn't working"],
         limits=["Controlled substances only for patients who can come in person to Greenwood on Tuesdays during the day",
                 "No patients who need a daily benzodiazepine", "No long-acting injectables"],
         target_segments=ALL, sort=1,
         profile_url="https://pariscounselingllc.org/staff/andrew-slaton-msn-aprn-pmhnp-bc/"),
    dict(email=None, name="Stephanie Poole", creds="LCSW", role="Therapist · individual therapy",
         status="open", openings="Taking new clients", where_text="Greenwood", ages="Teens and adults",
         insurance=["Anthem", "Optum", "UnitedHealthcare", "UMR", "Aetna", "Community Health Network EAP", "Self-pay"],
         fits=["Depression and anxiety", "Grief and loss", "Trauma", "Life transitions",
               "CBT, ACT, solution-focused, mindfulness"],
         limits=[], target_segments=MED, sort=2,
         profile_url="https://pariscounselingllc.org/staff/stephanie-poole-lcsw/"),
    dict(email="randi.paris@pariscounselingllc.org", name="Randi Paris", creds="LCSW", role="Owner",
         is_admin=True, clinical=False, sort=90),
    dict(email="ben.paris@pariscounselingllc.org", name="Ben Paris", creds="", role="Operations",
         is_admin=True, clinical=False, sort=91),
]

cols = ["email", "name", "creds", "role", "is_prescriber", "is_admin", "clinical", "status", "openings",
        "where_text", "ages", "insurance", "fits", "limits", "target_segments", "profile_url", "sort"]
rows = []
for r in roster:
    v = []
    for c in cols:
        x = r.get(c)
        if c in ("insurance", "fits", "limits", "target_segments"):
            v.append(arr(x or ([] if c != "target_segments" else MED)))
        elif c in ("is_prescriber", "is_admin"):
            v.append("true" if x else "false")
        elif c == "clinical":
            v.append("false" if x is False else "true")
        elif c == "sort":
            v.append(str(x or 100))
        elif c == "email":
            v.append("null" if not x else q(x))
        elif c == "status":
            v.append(q(x or "open"))
        else:
            v.append(q(x or ""))
    rows.append("(" + ",".join(v) + ")")
(out / "00_roster.sql").write_text(
    f"insert into public.clinicians ({','.join(cols)}) values\n" + ",\n".join(rows) + "\non conflict do nothing;\n")

pcols = ["id", "practice", "address", "city", "zip", "phone", "segment", "system", "clinicians",
         "clinician_count", "npis", "taxonomy", "area", "priority"]
chunk, n, size = [], 1, 0
def flush():
    global chunk, n, size
    if not chunk: return
    (out / f"{n:02d}_practices.sql").write_text(
        f"insert into public.practices ({','.join(pcols)}) values\n" + ",\n".join(chunk) +
        "\non conflict (id) do update set practice=excluded.practice, address=excluded.address, city=excluded.city, "
        "zip=excluded.zip, phone=excluded.phone, segment=excluded.segment, system=excluded.system, "
        "clinicians=excluded.clinicians, clinician_count=excluded.clinician_count, npis=excluded.npis, "
        "taxonomy=excluded.taxonomy, area=excluded.area, priority=excluded.priority;\n")
    n += 1; chunk = []; size = 0
for p in practices:
    row = "(" + ",".join([q(p["id"]), q(p["practice"]), q(p["address"]), q(p["city"]), q(p["zip"]),
                          q(p["phone"]), q(p["segment"]), q(p["system"]), arr(p.get("clinicians") or []),
                          str(int(p.get("count") or 0)), arr(p.get("npis") or []), q(p.get("taxonomy") or ""),
                          q(p["area"]), q(p["priority"])]) + ")"
    chunk.append(row); size += len(row)
    if size > 45000: flush()
flush()
print("practices", len(practices), "files", sorted(x.name for x in out.iterdir()))
