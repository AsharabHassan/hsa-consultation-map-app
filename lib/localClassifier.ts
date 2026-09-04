/**
 * Bridge to the shared skin-concern image classifier (the same trained model
 * the other clinic apps use, reached over HTTPS with this app's own key).
 *
 * The classifier only ever says WHICH regions are visible. It never names a
 * treatment: the routes in lib/consultation.ts are the only ones agreed with
 * Harley Street Aesthetics, and every concern still passes through treatmentRouteFor() before a
 * client or the CRM sees it.
 */
import type { FaceAnnotation, SkinAnalysis } from "./types";

export const LOCAL_CLASSIFIER_LABELS = [
  "forehead_lines",
  "glabella_lines",
  "crows_feet",
  "under_eye_hollow",
  "under_eye_dark",
  "under_eye_puffy",
  "under_eye_crepey",
  "cheek_volume_loss",
  "nasolabial_folds",
  "marionette_lines",
  "jawline_laxity",
  "under_chin_fullness",
  "pigmentation",
  "redness",
  "texture_pores",
  "acne_scarring",
  "dullness_dehydration",
  "lip_lines",
] as const;

export type ClassifierLabel = (typeof LOCAL_CLASSIFIER_LABELS)[number];

export interface ClassifierPrediction {
  modelVersion: string;
  probabilities: Record<ClassifierLabel, number>;
  thresholds: Record<ClassifierLabel, number>;
}

export interface ClassifierPositive {
  label: ClassifierLabel;
  probability: number;
  threshold: number;
}

export interface ClassifierSummary {
  modelVersion: string;
  agreed: number;
  disagreed: number;
  unmappedAreas: number;
  /** Regions the classifier flags that the vision analysis did not mention. */
  unmatchedPositives: ClassifierPositive[];
}

/**
 * Observation wording → label. Ordered: first match wins, so specific under-eye
 * kinds precede the generic one. Applied to concern text and area names.
 */
const OBSERVATION_PATTERNS: [RegExp, ClassifierLabel][] = [
  [/glabella|frown|\b11s?\b|between the brows/i, "glabella_lines"],
  [/forehead (?:lines?|creas|wrinkl)|horizontal (?:lines?|creas)/i, "forehead_lines"],
  [/crow['’]?s?[ -]?feet|lateral canth|periorbital lines/i, "crows_feet"],
  [/tear trough|under[ -]?eye hollow|hollow/i, "under_eye_hollow"],
  [/dark circle|under[ -]?eye (?:dark|discolou?r|shadow)|periorbital (?:dark|pigment)/i, "under_eye_dark"],
  [/puff|eye bag|malar bag|festoon/i, "under_eye_puffy"],
  [/under[ -]?eye crep|lower eyelid (?:crep|lines?)/i, "under_eye_crepey"],
  [/cheek (?:volume|flatten|hollow|deflat)|mid[ -]?face (?:volume|flatten)|volume loss/i, "cheek_volume_loss"],
  [/nasolabial|smile line|nose[ -]to[ -]mouth/i, "nasolabial_folds"],
  [/marionette|mouth corner|oral commissure|prejowl/i, "marionette_lines"],
  [/jowl|jawline (?:lax|soft|definition|contour)|lower face lax|neck lax|skin laxity/i, "jawline_laxity"],
  [/under[ -]?chin|submental|double chin/i, "under_chin_fullness"],
  [/pigment|dark spot|sun ?spot|melasma|uneven tone|discolou?r/i, "pigmentation"],
  [/redness|rosacea|flush|erythema|thread vein|broken capillar/i, "redness"],
  [/\bpore|texture|rough/i, "texture_pores"],
  [/acne scar|atrophic|ice[ -]?pick|boxcar|scarring/i, "acne_scarring"],
  [/dull|dehydrat|\bdry|radiance|luminos|tired/i, "dullness_dehydration"],
  [/lip line|perioral|smoker|barcode|upper lip/i, "lip_lines"],
];

/** Bare location names → the label most often meant. Applied to area names only. */
const LOCATION_PATTERNS: [RegExp, ClassifierLabel][] = [
  [/\bforehead\b/i, "forehead_lines"],
  [/under[ -]?eye|lower eyelid|periorbital/i, "under_eye_crepey"],
  [/mid[ -]?face|\bcheek/i, "cheek_volume_loss"],
  [/\bjaw/i, "jawline_laxity"],
];

function firstLabelIn(
  text: string,
  patterns: [RegExp, ClassifierLabel][],
): ClassifierLabel | null {
  if (!text.trim()) return null;
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) return label;
  }
  return null;
}

/**
 * Maps a report annotation to a classifier label. Concern wording wins over
 * the area name because the vision model often labels the area broadly
 * ("Left cheek", "Central face") while the concern says what was actually
 * seen. Bare locations are a last resort.
 */
export function classifierLabelForArea(
  area: string,
  concern = "",
): ClassifierLabel | null {
  return (
    firstLabelIn(concern, OBSERVATION_PATTERNS) ??
    firstLabelIn(area, OBSERVATION_PATTERNS) ??
    firstLabelIn(area, LOCATION_PATTERNS)
  );
}

export function attachSecondOpinions(
  analysis: SkinAnalysis,
  prediction: ClassifierPrediction | null,
): { analysis: SkinAnalysis; summary: ClassifierSummary | null } {
  if (!prediction) return { analysis, summary: null };

  const matched = new Set<ClassifierLabel>();
  let agreed = 0;
  let disagreed = 0;
  let unmappedAreas = 0;

  const knownLabels = new Set<string>(LOCAL_CLASSIFIER_LABELS);
  const annotations: FaceAnnotation[] = analysis.annotations.map((item) => {
    // Lead mode stamps the classifier region on the pin; trust it over wording.
    const label =
      typeof item.region === "string" && knownLabels.has(item.region)
        ? (item.region as ClassifierLabel)
        : classifierLabelForArea(item.area, item.concern);
    if (!label) {
      unmappedAreas += 1;
      return item;
    }
    matched.add(label);
    const probability = prediction.probabilities[label];
    const threshold = prediction.thresholds[label];
    const agrees = probability >= threshold;
    if (agrees) agreed += 1;
    else disagreed += 1;
    return { ...item, secondOpinion: { label, probability, threshold, agrees } };
  });

  const unmatchedPositives: ClassifierPositive[] = LOCAL_CLASSIFIER_LABELS.filter(
    (label) =>
      !matched.has(label) &&
      prediction.probabilities[label] >= prediction.thresholds[label],
  ).map((label) => ({
    label,
    probability: prediction.probabilities[label],
    threshold: prediction.thresholds[label],
  }));

  return {
    analysis: { ...analysis, annotations },
    summary: {
      modelVersion: prediction.modelVersion,
      agreed,
      disagreed,
      unmappedAreas,
      unmatchedPositives,
    },
  };
}

function isLabelRecord(value: unknown): value is Record<ClassifierLabel, number> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return LOCAL_CLASSIFIER_LABELS.every((label) => {
    const n = record[label];
    return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  });
}

function parsePrediction(value: unknown): ClassifierPrediction | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isLabelRecord(record.probabilities) || !isLabelRecord(record.thresholds)) {
    return null;
  }
  return {
    modelVersion:
      typeof record.modelVersion === "string" ? record.modelVersion : "unknown",
    probabilities: record.probabilities,
    thresholds: record.thresholds,
  };
}

/** The classifier is remote now, so allow for a cold container and TLS setup. */
export const LOCAL_CLASSIFIER_TIMEOUT_MS = 6_000;

export async function fetchLocalClassifierPrediction(
  image: { mediaType: string; data: string },
  options: {
    url: string | undefined;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    /** Shared secret for a classifier reachable over the internet (X-Classifier-Key). */
    secret?: string;
  },
): Promise<ClassifierPrediction | null> {
  const base = options.url?.trim().replace(/\/+$/, "");
  if (!base) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const secret = options.secret?.trim();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-classifier-key"] = secret;
  const timeout = AbortSignal.timeout(
    options.timeoutMs ?? LOCAL_CLASSIFIER_TIMEOUT_MS,
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  try {
    const response = await fetchImpl(`${base}/predict`, {
      method: "POST",
      headers,
      body: JSON.stringify({ mediaType: image.mediaType, data: image.data }),
      signal,
    });
    if (!response.ok) return null;
    return parsePrediction(await response.json());
  } catch {
    // The classifier is optional. Any failure (server down, timeout, bad
    // payload) must never affect the consultation.
    return null;
  }
}
