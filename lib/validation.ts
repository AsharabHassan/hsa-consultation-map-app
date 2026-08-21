import type { LeadPayload, SkinGoal } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const VALID_GOALS: SkinGoal[] = [
  "Dark circles & under-eyes",
  "Acne scarring & texture",
  "Pigmentation & uneven tone",
  "Jawline definition & jowls",
  "Lower-face or neck laxity",
  "Volume loss & facial contour",
  "Fine lines & skin quality",
  "Hydration & radiance",
  "I am not sure",
];

export function validateLead(input: unknown):
  | { ok: true; lead: LeadPayload }
  | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Invalid request body." };
  }
  const o = input as Record<string, unknown>;

  const name = typeof o.name === "string" ? o.name.trim() : "";
  const email = typeof o.email === "string" ? o.email.trim() : "";
  const phone = typeof o.phone === "string" ? o.phone.trim() : "";
  const consent = o.consent === true;
  const goals = Array.isArray(o.goals)
    ? (o.goals.filter(
        (g): g is SkinGoal =>
          typeof g === "string" && (VALID_GOALS as string[]).includes(g),
      ).slice(0, 2) as SkinGoal[])
    : [];

  if (name.length < 2) return { ok: false, error: "Please enter your name." };
  if (!EMAIL_RE.test(email))
    return { ok: false, error: "Please enter a valid email address." };
  if (phone.replace(/\D/g, "").length < 7)
    return { ok: false, error: "Please enter a valid phone number." };
  if (!consent)
    return { ok: false, error: "Please accept the consent statement to continue." };

  return { ok: true, lead: { name, email, phone, goals, consent } };
}
