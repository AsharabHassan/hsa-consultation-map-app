/**
 * Canonical consent + disclaimer copy, shared across the app UI and the PDF so
 * the wording is identical everywhere and only ever changes in one place.
 */

/** Shown as a required checkbox BEFORE the camera/upload opens (step 01). */
export const PHOTO_CONSENT =
  "I understand this is a cosmetic, non-diagnostic AI tool — not medical advice or a diagnosis — and I consent to my photo being processed to generate my analysis. My photo is used only to create the result and is never stored.";

/** One-line disclaimer for compact / footer placements. */
export const DISCLAIMER_SHORT =
  "Cosmetic, non-diagnostic AI assessment of visible facial appearance only. Not medical advice or a diagnosis.";

/** Full disclaimer for the prominent notices on the result page and the PDF. */
export const DISCLAIMER_FULL =
  "This is a cosmetic, non-diagnostic AI assessment of visible facial appearance only. It is not medical advice, a diagnosis, confirmation of treatment suitability or a guarantee of results. Harley Street Aesthetics will confirm your medical history, skin, goals and the safest proportionate options during consultation.";
