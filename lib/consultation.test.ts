import assert from "node:assert/strict";
import { test } from "node:test";
import { normaliseConsultationAnalysis, treatmentRouteFor } from "./consultation";
import type { ConsultationPlanItem, SkinAnalysis } from "./types";

const item = (area: string, concern: string): ConsultationPlanItem => ({
  area,
  concern,
  treatmentRoute: "Clinician assessment",
  reasoning: "Visible in the photograph.",
  consultationObjective: "Confirm suitability.",
  expectedDirection: "",
  typicalJourney: "",
  priceGuide: "",
});

test("routes the verified HSA concern portfolio deterministically", () => {
  assert.equal(treatmentRouteFor({ area: "Under-eyes", concern: "Dark circles without visible hollowing" }), "Polynucleotide under-eye programme");
  assert.equal(treatmentRouteFor({ area: "Lower eyelids", concern: "Crepey texture and fine lines" }), "Fractional CO2 eye consultation");
  assert.equal(treatmentRouteFor({ area: "Tear trough", concern: "Clear hollow and structural shadow" }), "Dermal filler contouring assessment");
  assert.equal(treatmentRouteFor({ area: "Jawline and jowls", concern: "Visible tissue descent and loss of definition" }), "PLACL thread-lift consultation");
  assert.equal(treatmentRouteFor({ area: "Lower face", concern: "Mild laxity and reduced firmness" }), "HIFU lifting consultation");
  assert.equal(treatmentRouteFor({ area: "Cheeks", concern: "Acne scarring and enlarged pores" }), "Virtue RF microneedling programme");
  assert.equal(treatmentRouteFor({ area: "Cheeks", concern: "Discrete dark spots and uneven pigmentation" }), "Q-switch laser + mesotherapy assessment");
  assert.equal(treatmentRouteFor({ area: "Overall face", concern: "Reduced hydration and radiance" }), "Veluria skin-booster programme");
  assert.equal(treatmentRouteFor({ area: "Mid-face", concern: "Slightly dull, flat-looking skin tone" }), "Veluria skin-booster programme");
  assert.equal(treatmentRouteFor({ area: "Jawline", concern: "Mild softening of lower-face contour" }), "HIFU lifting consultation");
  assert.equal(treatmentRouteFor({ area: "Forehead", concern: "Fine horizontal lines" }), "Virtue RF microneedling programme");
});

test("blocks EndoLift and unsafe visible features", () => {
  assert.equal(treatmentRouteFor({ area: "Jawline", concern: "EndoLift requested for definition" }), "Clinician assessment");
  assert.equal(treatmentRouteFor({ area: "Cheek", concern: "Raised inflamed active breakout" }), "Clinician assessment");
  assert.equal(treatmentRouteFor({ area: "Nose", concern: "Crusted raised lesion" }), "Clinician assessment");
});

test("keeps no more than three distinct secondary concerns", () => {
  const input: SkinAnalysis = {
    summary: "Two visible priorities are present. A clinician should confirm the plan.",
    categories: [
      { label: "Under-eye appearance", score: 62, note: "Visible darkness." },
      { label: "Texture & scarring", score: 58, note: "Visible texture." },
      { label: "Tone & pigmentation", score: 76, note: "Mostly even." },
      { label: "Firmness & contour", score: 74, note: "Mild change." },
      { label: "Hydration & radiance", score: 71, note: "Some dullness." },
    ],
    annotations: [
      { x: 42, y: 38, area: "Under-eyes", concern: "Dark circles", priority: "high", treatment: "Clinician assessment", severity: "notable" },
      { x: 35, y: 57, area: "Cheeks", concern: "Acne scarring and pores", priority: "medium", treatment: "Clinician assessment", severity: "moderate" },
      { x: 50, y: 72, area: "Jawline", concern: "Mild laxity", priority: "medium", treatment: "Clinician assessment", severity: "moderate" },
    ],
    clinicianReview: [],
    consultationPlan: {
      highPriority: item("Under-eyes", "Dark circles"),
      mediumPriorities: [
        item("Cheeks", "Acne scarring and enlarged pores"),
        item("Jawline", "Mild laxity and reduced firmness"),
        item("Forehead", "Discrete dark spots and uneven pigmentation"),
        item("Neck", "Reduced hydration and radiance"),
      ],
    },
    disclaimer: "",
  };
  const result = normaliseConsultationAnalysis(input);
  assert.equal(result.consultationPlan.mediumPriorities.length, 3);
  assert.equal(result.consultationPlan.mediumPriorities[0]?.treatmentRoute, "Virtue RF microneedling programme");
  assert.equal(result.annotations.length, 3);
  assert.equal(result.annotations[2]?.priority, "medium");
});

test("does not invent a treatment need for a healthy baseline", () => {
  const input: SkinAnalysis = {
    summary: "Skin appears healthy. No pronounced concern is visible.",
    categories: [
      { label: "Under-eye appearance", score: 78, note: "Mild shadow." },
      { label: "Texture & scarring", score: 90, note: "Even." },
      { label: "Tone & pigmentation", score: 87, note: "Even." },
      { label: "Firmness & contour", score: 84, note: "Supported." },
      { label: "Hydration & radiance", score: 80, note: "Healthy baseline." },
    ],
    annotations: [
      { x: 50, y: 50, area: "Overall face", concern: "Healthy visible baseline", priority: "high", treatment: "Clinician assessment", severity: "moderate" },
    ],
    clinicianReview: [],
    consultationPlan: {
      highPriority: item("Overall face", "Healthy visible baseline"),
      mediumPriorities: [item("Cheeks", "Optional hydration")],
    },
    disclaimer: "",
  };
  const result = normaliseConsultationAnalysis(input);
  assert.equal(result.consultationPlan.highPriority.treatmentRoute, "No treatment recommendation");
  assert.equal(result.consultationPlan.mediumPriorities.length, 0);
});

test("maps bilateral observations as one concern area", () => {
  const input: SkinAnalysis = {
    summary: "Visible under-eye darkness is the main priority. Texture is also recorded.",
    categories: [
      { label: "Under-eye appearance", score: 55, note: "Visible darkness." },
      { label: "Texture & scarring", score: 68, note: "Some texture." },
      { label: "Tone & pigmentation", score: 72, note: "Mostly even." },
      { label: "Firmness & contour", score: 74, note: "Supported." },
      { label: "Hydration & radiance", score: 70, note: "Some dullness." },
    ],
    annotations: [
      { x: 39, y: 40, area: "Left under-eye", concern: "Dark circles", priority: "high", treatment: "Clinician assessment", severity: "notable" },
      { x: 61, y: 40, area: "Right under-eye", concern: "Dark circles", priority: "high", treatment: "Clinician assessment", severity: "notable" },
      { x: 50, y: 58, area: "Cheeks", concern: "Enlarged pores", priority: "observed", treatment: "Clinician assessment", severity: "moderate" },
    ],
    clinicianReview: [],
    consultationPlan: {
      highPriority: item("Under-eye region", "Dark circles without hollowing"),
      mediumPriorities: [],
    },
    disclaimer: "",
  };
  const result = normaliseConsultationAnalysis(input);
  assert.equal(result.annotations.length, 2);
  assert.equal(result.annotations[0]?.priority, "high");
  assert.equal(result.annotations[1]?.priority, "medium");
});

test("reconciles a secondary marker when Sonnet varies the area wording", () => {
  const input: SkinAnalysis = {
    summary: "The under-eye area is the main focus. Overall radiance is also worth discussing.",
    categories: [
      { label: "Under-eye appearance", score: 56, note: "Visible hollowing." },
      { label: "Texture & scarring", score: 75, note: "Mostly even." },
      { label: "Tone & pigmentation", score: 74, note: "Mostly even." },
      { label: "Firmness & contour", score: 71, note: "Mild change." },
      { label: "Hydration & radiance", score: 64, note: "Visible dullness." },
    ],
    annotations: [
      { x: 40, y: 41, area: "Left under-eye", concern: "Tear-trough hollowing", priority: "high", treatment: "Clinician assessment", severity: "notable" },
      { x: 50, y: 55, area: "Overall complexion", concern: "Slightly dull, flat-looking skin tone", priority: "observed", treatment: "Clinician assessment", severity: "moderate" },
    ],
    clinicianReview: [],
    consultationPlan: {
      highPriority: item("Under-eye region", "Tear-trough hollowing"),
      mediumPriorities: [item("Overall facial complexion", "Reduced radiance and dullness")],
    },
    disclaimer: "",
  };
  const result = normaliseConsultationAnalysis(input);
  assert.equal(result.consultationPlan.mediumPriorities.length, 1);
  assert.equal(result.annotations[1]?.priority, "medium");
  assert.equal(result.annotations[1]?.treatment, "Veluria skin-booster programme");
});

test("raised describing posture or expression does not trigger clinician review", () => {
  const forehead = treatmentRouteFor({
    area: "Forehead",
    concern: "Fine horizontal lines",
    reasoning: "Horizontal forehead lines are visible with raised brow position in this image.",
  });
  assert.notEqual(forehead, "Clinician assessment");
  assert.equal(
    treatmentRouteFor({ area: "Cheek", concern: "Raised lesion with crusting" }),
    "Clinician assessment",
  );
});
