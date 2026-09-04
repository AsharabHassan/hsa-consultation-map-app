import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CLASSIFIER_LABEL_NAMES,
  classifierModeFrom,
  leadPromptBlock,
  reconcileLeadAnalysis,
  selectLeadRegions,
  type LeadRegion,
} from "./classifierLead";
import {
  LOCAL_CLASSIFIER_LABELS,
  fetchLocalClassifierPrediction,
  type ClassifierLabel,
  type ClassifierPrediction,
} from "./localClassifier";
import { normaliseConsultationAnalysis } from "./consultation";
import type { SkinAnalysis, TreatmentRoute } from "./types";

const ROUTES_AGREED_WITH_HSA: TreatmentRoute[] = [
  "Polynucleotide under-eye programme",
  "Fractional CO2 eye consultation",
  "Dermal filler contouring assessment",
  "PLACL thread-lift consultation",
  "HIFU lifting consultation",
  "Virtue RF microneedling programme",
  "Fractional CO2 resurfacing consultation",
  "Q-switch laser + mesotherapy assessment",
  "Veluria skin-booster programme",
  "PRP regenerative skin consultation",
  "No treatment recommendation",
  "Clinician assessment",
];

function prediction(overrides: Partial<Record<ClassifierLabel, number>>): ClassifierPrediction {
  const probabilities = Object.fromEntries(
    LOCAL_CLASSIFIER_LABELS.map((l) => [l, overrides[l] ?? 0]),
  ) as Record<ClassifierLabel, number>;
  const thresholds = Object.fromEntries(
    LOCAL_CLASSIFIER_LABELS.map((l) => [l, 0.5]),
  ) as Record<ClassifierLabel, number>;
  return { modelVersion: "test", probabilities, thresholds };
}

const region = (label: ClassifierLabel): LeadRegion => ({
  label,
  name: CLASSIFIER_LABEL_NAMES[label],
  probability: 0.9,
  threshold: 0.5,
});

test("mode parsing defaults to observe and never guesses lead", () => {
  assert.equal(classifierModeFrom("lead"), "lead");
  assert.equal(classifierModeFrom("off"), "off");
  assert.equal(classifierModeFrom(undefined), "observe");
  assert.equal(classifierModeFrom("nonsense"), "observe");
});

test("only regions over both the tuned threshold and the floor can lead", () => {
  const picked = selectLeadRegions(
    prediction({ nasolabial_folds: 0.97, jawline_laxity: 0.6, redness: 0.49 }),
  );
  assert.deepEqual(
    picked.map((r) => r.label),
    ["nasolabial_folds", "jawline_laxity"],
  );
});

test("a missing prediction yields no lead regions, so the model leads instead", () => {
  assert.deepEqual(selectLeadRegions(null), []);
});

test("the prompt names anatomy only and never a treatment", () => {
  const block = leadPromptBlock([region("nasolabial_folds"), region("jawline_laxity")]);
  for (const route of ROUTES_AGREED_WITH_HSA) {
    if (route === "Clinician assessment" || route === "No treatment recommendation") continue;
    assert.ok(!block.includes(route), `prompt must not mention "${route}"`);
  }
  assert.ok(block.includes("nasolabial_folds"));
});

test("concerns outside the flagged regions are dropped before the mapper", () => {
  const outcome = reconcileLeadAnalysis(
    {
      annotations: [
        { area: "Left nasolabial fold", concern: "Fold", region: "nasolabial_folds" },
        { area: "Forehead", concern: "Horizontal lines", region: "forehead_lines" },
      ],
      consultationPlan: {
        highPriority: { area: "Left nasolabial fold", concern: "Fold", region: "nasolabial_folds" },
        mediumPriorities: [
          { area: "Forehead", concern: "Horizontal lines", region: "forehead_lines" },
        ],
      },
    },
    [region("nasolabial_folds")],
  );
  assert.equal(outcome.mode, "lead");
  if (outcome.mode !== "lead") return;
  assert.equal(outcome.dropped, 1);
  assert.equal(outcome.raw.annotations.length, 1);
});

test("a vetoed region is removed and reported with its reason", () => {
  const outcome = reconcileLeadAnalysis(
    {
      vetoed: [{ label: "redness", reason: "Colour cast from the lighting." }],
      annotations: [{ area: "Jawline", concern: "Jowling", region: "jawline_laxity" }],
      consultationPlan: {
        highPriority: { area: "Jawline", concern: "Jowling", region: "jawline_laxity" },
        mediumPriorities: [],
      },
    },
    [region("jawline_laxity"), region("redness")],
  );
  assert.equal(outcome.mode, "lead");
  if (outcome.mode !== "lead") return;
  assert.deepEqual(outcome.vetoed, [
    { label: "redness", reason: "Colour cast from the lighting." },
  ]);
});

test("when every region is vetoed the analysis falls back to model-led", () => {
  const outcome = reconcileLeadAnalysis(
    {
      vetoed: [{ label: "redness", reason: "Not visible." }],
      consultationPlan: { highPriority: undefined, mediumPriorities: [] },
    },
    [region("redness")],
  );
  assert.equal(outcome.mode, "fallback");
});

test("classifier-led output still resolves to HSA's agreed routes only", () => {
  // Every classifier region, described plainly, must map to an agreed route.
  for (const label of LOCAL_CLASSIFIER_LABELS) {
    const analysis = normaliseConsultationAnalysis({
      summary: "Test",
      categories: [],
      annotations: [],
      clinicianReview: [],
      consultationPlan: {
        highPriority: {
          area: CLASSIFIER_LABEL_NAMES[label],
          concern: CLASSIFIER_LABEL_NAMES[label],
        },
        mediumPriorities: [],
      },
      disclaimer: "",
    } as unknown as SkinAnalysis);
    const route = analysis.consultationPlan.highPriority.treatmentRoute;
    assert.ok(
      ROUTES_AGREED_WITH_HSA.includes(route),
      `region ${label} produced "${route}", which is not an agreed route`,
    );
  }
});

test("a classifier outage returns null rather than failing the consultation", async () => {
  const result = await fetchLocalClassifierPrediction(
    { mediaType: "image/jpeg", data: "x" },
    {
      url: "https://classifier.invalid",
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    },
  );
  assert.equal(result, null);
});

test("no classifier URL configured means the classifier is simply skipped", async () => {
  const result = await fetchLocalClassifierPrediction(
    { mediaType: "image/jpeg", data: "x" },
    { url: undefined },
  );
  assert.equal(result, null);
});

test("the shared secret is sent as X-Classifier-Key", async () => {
  let seen: Record<string, string> | undefined;
  await fetchLocalClassifierPrediction(
    { mediaType: "image/jpeg", data: "x" },
    {
      url: "https://classifier.example",
      secret: "s3cret",
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen = init.headers as Record<string, string>;
        return { ok: false } as Response;
      }) as unknown as typeof fetch,
    },
  );
  assert.equal(seen?.["x-classifier-key"], "s3cret");
});
