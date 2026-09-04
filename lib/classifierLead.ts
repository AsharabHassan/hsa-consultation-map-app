/**
 * Classifier-led analysis. The shared 18-region classifier decides WHICH
 * concerns may appear on the consultation map; the vision model only describes
 * and places them.
 *
 * Everything here runs on the RAW model JSON, before normaliseConsultationAnalysis
 * in lib/consultation.ts. Harley Street Aesthetics' agreed treatment routes are chosen there, by
 * treatmentRouteFor(), exactly as before — nothing in this file names, adds or
 * changes a treatment.
 */
import {
  classifierLabelForArea,
  LOCAL_CLASSIFIER_LABELS,
  type ClassifierLabel,
  type ClassifierPrediction,
} from "./localClassifier";

export type ClassifierMode = "off" | "observe" | "lead";

export function classifierModeFrom(value: unknown): ClassifierMode {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === "lead") return "lead";
  if (text === "off") return "off";
  return "observe";
}

/** Precision floor: a region must clear its tuned threshold AND this. */
export const LEAD_MIN_PROBABILITY = 0.35;
/** HSA's plan is one high priority plus up to three mediums, and up to seven pins. */
export const LEAD_MAX_REGIONS = 7;

export interface LeadRegion {
  label: ClassifierLabel;
  name: string;
  probability: number;
  threshold: number;
}

/**
 * Anatomical names only. These describe where to look, never what to do about
 * it: the treatment route is decided later by treatmentRouteFor().
 */
export const CLASSIFIER_LABEL_NAMES: Record<ClassifierLabel, string> = {
  forehead_lines: "Forehead lines",
  glabella_lines: "Glabella (frown) lines",
  crows_feet: "Crow's feet",
  under_eye_hollow: "Under-eye hollowing / tear trough",
  under_eye_dark: "Under-eye darkness",
  under_eye_puffy: "Under-eye puffiness",
  under_eye_crepey: "Under-eye crepey skin",
  cheek_volume_loss: "Cheek volume loss",
  nasolabial_folds: "Nasolabial folds",
  marionette_lines: "Marionette lines",
  jawline_laxity: "Jawline laxity / jowls",
  under_chin_fullness: "Under-chin fullness",
  pigmentation: "Pigmentation / uneven tone",
  redness: "Redness",
  texture_pores: "Texture / enlarged pores",
  acne_scarring: "Acne scarring",
  dullness_dehydration: "Dullness / dehydration",
  lip_lines: "Lip lines",
};

export function selectLeadRegions(
  prediction: ClassifierPrediction | null,
): LeadRegion[] {
  if (!prediction) return [];
  return LOCAL_CLASSIFIER_LABELS.map((label) => ({
    label,
    name: CLASSIFIER_LABEL_NAMES[label],
    probability: prediction.probabilities[label],
    threshold: prediction.thresholds[label],
  }))
    .filter(
      (r) =>
        r.probability >= r.threshold && r.probability >= LEAD_MIN_PROBABILITY,
    )
    .sort((a, b) => b.probability - b.threshold - (a.probability - a.threshold))
    .slice(0, LEAD_MAX_REGIONS);
}

export function leadPromptBlock(regions: LeadRegion[]): string {
  const list = regions.map((r) => `- ${r.name} (id: ${r.label})`).join("\n");
  return `CLINIC CLASSIFIER FINDINGS. A classifier trained on clinic consultation records has flagged the following regions in this photograph:
${list}
Describe and place ONLY these flagged regions (one plan item and annotation per region that is visible; use left/right markers where bilateral). On every plan item and annotation include the field "region": <id> copied exactly from the list above. Do not add any other concern. If a flagged region is genuinely not visible in this photograph, omit it from the plan and list it in an extra top-level field "vetoed": [{"label": <id>, "reason": <one short sentence>}].`;
}

export interface LeadVeto {
  label: ClassifierLabel;
  reason: string;
}

export type LeadOutcome =
  | {
      mode: "lead";
      raw: Record<string, unknown> & {
        consultationPlan: RawPlan;
        annotations: RawAnnotation[];
      };
      regions: LeadRegion[];
      vetoed: LeadVeto[];
      dropped: number;
      /** Flagged regions the vision model neither described nor vetoed. */
      omitted: ClassifierLabel[];
    }
  | {
      mode: "fallback";
      raw: Record<string, unknown>;
      reason: string;
      regions: LeadRegion[];
    };

type RawItem = { area?: unknown; concern?: unknown; region?: unknown } & Record<
  string,
  unknown
>;
type RawAnnotation = RawItem;
type RawPlan = { highPriority?: RawItem; mediumPriorities?: RawItem[] } & Record<
  string,
  unknown
>;

const KNOWN_LABELS = new Set<string>(LOCAL_CLASSIFIER_LABELS);

function labelOf(item: RawItem | undefined): ClassifierLabel | null {
  if (!item) return null;
  if (typeof item.region === "string" && KNOWN_LABELS.has(item.region)) {
    return item.region as ClassifierLabel;
  }
  return classifierLabelForArea(
    typeof item.area === "string" ? item.area : "",
    typeof item.concern === "string" ? item.concern : "",
  );
}

function parseVetoes(value: unknown, allowed: Set<ClassifierLabel>): LeadVeto[] {
  if (!Array.isArray(value)) return [];
  const out: LeadVeto[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { label, reason } = entry as Record<string, unknown>;
    if (typeof label !== "string" || !allowed.has(label as ClassifierLabel)) {
      continue;
    }
    out.push({
      label: label as ClassifierLabel,
      reason: typeof reason === "string" ? reason.trim().slice(0, 200) : "",
    });
  }
  return out;
}

export function reconcileLeadAnalysis(
  rawInput: Record<string, unknown>,
  regions: LeadRegion[],
): LeadOutcome {
  const allowed = new Set(regions.map((r) => r.label));
  if (allowed.size === 0) {
    return { mode: "fallback", raw: rawInput, reason: "no_regions", regions };
  }
  const { vetoed: rawVetoes, ...raw } = rawInput;
  const vetoed = parseVetoes(rawVetoes, allowed);
  for (const v of vetoed) allowed.delete(v.label);

  const keep = (item: RawItem | undefined): boolean => {
    const label = labelOf(item);
    return label !== null && allowed.has(label);
  };
  // The echoed region id is kept so treatmentRouteFor() still sees the full
  // area/concern wording it has always matched on.

  const plan = (raw.consultationPlan ?? {}) as RawPlan;
  const high = plan.highPriority;
  const mediums = Array.isArray(plan.mediumPriorities) ? plan.mediumPriorities : [];
  const items = [high, ...mediums].filter((i): i is RawItem => Boolean(i));
  const surviving = items.filter(keep);
  const droppedItems = items.length - surviving.length;

  if (surviving.length === 0) {
    return { mode: "fallback", raw: rawInput, reason: "all_vetoed", regions };
  }

  const annotations = Array.isArray(raw.annotations)
    ? (raw.annotations as RawAnnotation[]).filter(keep)
    : [];
  const kept = surviving;
  // A region counts as described when it appears as a plan item OR a pin.
  const described = new Set([...kept, ...annotations].map(labelOf));
  const omitted = regions
    .map((r) => r.label)
    .filter((label) => allowed.has(label) && !described.has(label));

  return {
    mode: "lead",
    raw: {
      ...raw,
      annotations,
      consultationPlan: {
        ...plan,
        highPriority: kept[0],
        mediumPriorities: kept.slice(1),
      },
    },
    regions,
    vetoed,
    dropped: droppedItems,
    omitted,
  };
}
