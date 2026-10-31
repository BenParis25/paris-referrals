export type Status = "open" | "limited" | "full";
export const CLAIM_STATUSES = ["Claimed", "Called", "Letter sent", "Meeting set", "Referring", "Not a fit"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export const SEGMENTS = ["Therapy practice", "Primary care", "Internal medicine", "Pediatrics", "OB/GYN"] as const;

export interface Clinician {
  id: string;
  email: string | null;
  name: string;
  creds: string;
  role: string;
  is_prescriber: boolean;
  is_admin: boolean;
  clinical: boolean;
  active: boolean;
  status: Status;
  openings: string;
  where_text: string;
  ages: string;
  insurance: string[];
  fits: string[];
  limits: string[];
  target_segments: string[];
  profile_url: string;
  sort: number;
  updated_at: string;
}

export interface Practice {
  id: string;
  practice: string;
  address: string;
  city: string;
  zip: string;
  phone: string;
  fax: string;
  segment: string;
  system: string;
  clinicians: string[];
  clinician_count: number;
  npis: string[];
  taxonomy: string;
  area: "Greenwood" | "Lawrence";
  priority: "A" | "B" | "C";
  hidden: boolean;
}

export interface Claim {
  practice_id: string;
  clinician_id: string;
  status: ClaimStatus;
  contact_name: string;
  contact_email: string;
  contact_fax: string;
  next_date: string | null;
  notes: string;
  claimed_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  practice_id: string;
  clinician_id: string | null;
  kind: string;
  body: string;
  at: string;
}

export interface Settings {
  phone: string;
  fax: string;
  email: string;
  request_url: string;
  greenwood: string;
  lawrence: string;
}
