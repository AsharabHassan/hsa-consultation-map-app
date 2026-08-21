import type {
  ConsultationPlan,
  ConsultationPlanItem,
  FaceAnnotation,
  SkinAnalysis,
  TreatmentRoute,
} from "./types";

export const CONSULTATION_DISCLAIMER =
  "This is a cosmetic, non-diagnostic assessment of visible appearance only. It is not medical advice, a diagnosis, confirmation of treatment suitability or a guarantee of results. A Harley Street Aesthetics clinician will assess your medical history, skin, priorities and suitability before recommending treatment.";

const SAFE_ROUTES = new Set<TreatmentRoute>([
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
]);

type RouteDetails = Pick<
  ConsultationPlanItem,
  "expectedDirection" | "typicalJourney" | "priceGuide"
>;

export const ROUTE_DETAILS: Record<TreatmentRoute, RouteDetails> = {
  "Polynucleotide under-eye programme": {
    expectedDirection:
      "May support a fresher-looking under-eye area and improve the appearance of skin quality; pigment, vessels and hollows need separate assessment.",
    typicalJourney:
      "HSA lists single-session and three-session dark-circle programmes; the clinician confirms the product, spacing and suitability.",
    priceGuide: "HSA dark-circle programme: £395 once or £995 for three sessions.",
  },
  "Fractional CO2 eye consultation": {
    expectedDirection:
      "May improve visible lower-eyelid crepiness and fine surface lines without changing the person’s natural eye shape.",
    typicalJourney:
      "The fractional CO2 eye option is assessed as a focused treatment; downtime and the number of sessions depend on skin and goals.",
    priceGuide: "HSA CO2 eye treatment: currently from £760 (standard price £950).",
  },
  "Dermal filler contouring assessment": {
    expectedDirection:
      "May restore selected volume or add subtle contour where the concern is structural rather than skin quality.",
    typicalJourney:
      "Results can be visible after treatment and settle over the following days; product, volume and area are confirmed by the doctor.",
    priceGuide: "HSA guide: tear trough from £299; jawline from £399.",
  },
  "PLACL thread-lift consultation": {
    expectedDirection:
      "May create a visible but natural-looking lift through selected lower-face, jowl or jawline tissue.",
    typicalJourney:
      "HSA describes immediate support with progressive collagen stimulation and typical longevity of 18–24 months; individual outcomes vary.",
    priceGuide: "HSA guide: jawline from £1,295; mid and lower face from £1,495.",
  },
  "HIFU lifting consultation": {
    expectedDirection:
      "May improve mild-to-moderate visible laxity and definition through gradual tightening rather than added volume.",
    typicalJourney:
      "Usually discussed as a focused energy-based session, with changes developing progressively; the exact technology and zones are confirmed in consultation.",
    priceGuide: "HSA guide: targeted HIFU from £500; full face from £800.",
  },
  "Virtue RF microneedling programme": {
    expectedDirection:
      "May soften the appearance of acne scarring, enlarged pores and uneven texture while supporting firmness.",
    typicalJourney:
      "HSA typically recommends a course of three sessions, with collagen remodelling developing over roughly 3–6 months.",
    priceGuide: "HSA guide: full face £399; acne-scarring course of three £950.",
  },
  "Fractional CO2 resurfacing consultation": {
    expectedDirection:
      "May improve more established surface texture, etched lines and selected visible scarring after clinician-led skin-type assessment.",
    typicalJourney:
      "A focused or full-face session may be discussed; recovery, pigment risk and whether a course is appropriate are assessed first.",
    priceGuide: "Current HSA offers: half face £636; full face £799.",
  },
  "Q-switch laser + mesotherapy assessment": {
    expectedDirection:
      "May improve the appearance of suitable discrete pigmentation and uneven tone without changing the person’s natural skin colour.",
    typicalJourney:
      "A patch test and in-person pigment assessment come first; the clinician decides whether laser, mesotherapy or a staged combination is appropriate.",
    priceGuide: "HSA laser plus mesotherapy: £399; patch test £50.",
  },
  "Veluria skin-booster programme": {
    expectedDirection:
      "May improve hydration, radiance and overall visible skin quality; it is not a filler or a treatment for lesions and active skin disease.",
    typicalJourney:
      "The appropriate Veluria formula, application method and course length are selected after consultation.",
    priceGuide: "HSA skin boosters start from £249; the Veluria plan is priced at consultation.",
  },
  "PRP regenerative skin consultation": {
    expectedDirection:
      "May support gradual improvement in diffuse skin vitality and texture using an autologous regenerative approach.",
    typicalJourney:
      "A clinician determines whether PRP is appropriate and whether it should be used alone or within a staged skin-quality plan.",
    priceGuide: "Pricing is confirmed after the clinician selects the area and protocol.",
  },
  "No treatment recommendation": {
    expectedDirection:
      "No pronounced cosmetic concern is clear enough in this photograph to justify a treatment recommendation.",
    typicalJourney:
      "Continue normal skin care, or use the complimentary consultation for maintenance guidance if desired.",
    priceGuide: "No treatment cost is recommended from this photograph.",
  },
  "Clinician assessment": {
    expectedDirection:
      "The photograph alone cannot safely predict a cosmetic result for this visible feature.",
    typicalJourney:
      "A clinician should examine the area before discussing any cosmetic treatment direction.",
    priceGuide: "Online consultation is free; any treatment price follows assessment.",
  },
};

const clean = (value: unknown, fallback = "") =>
  typeof value === "string"
    ? value
        .replace(/\b(?:EndoLift|Endolift|Endomax(?:\s+Lift)?)\b/gi, "another treatment pathway")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 520)
    : fallback;

const concernText = (item: Partial<ConsultationPlanItem>) =>
  `${clean(item.area)} ${clean(item.concern)} ${clean(item.reasoning)}`.toLowerCase();

/** Server-side treatment boundary. EndoLift and unapproved routes cannot pass. */
export function treatmentRouteFor(
  item: Partial<ConsultationPlanItem>,
  review = false,
): TreatmentRoute {
  if (review) return "Clinician assessment";
  const text = concernText(item);

  if (
    /active|inflam|raised|bleed|crust|scal|rash|wound|ulcer|infection|suspicious|lesion|mole|skin tag|vessel|thread vein|medical condition/.test(
      text,
    )
  ) {
    return "Clinician assessment";
  }

  if (/(under.?eye|tear trough|lower eyelid)/.test(text)) {
    const explicitlyNoHollow =
      /(?:without|no|not)\s+(?:a\s+)?(?:clear\s+|visible\s+)?(?:structural\s+)?(?:hollow|hollowing|volume loss|deficit)/.test(
        text,
      );
    if (
      !explicitlyNoHollow &&
      /(hollow|volume loss|sunken|fat pad|structural shadow)/.test(text)
    ) {
      return "Dermal filler contouring assessment";
    }
    if (/(crep|fine line|wrinkl|loose|lax|eyelid texture)/.test(text)) {
      return "Fractional CO2 eye consultation";
    }
    if (/(dark circle|shadow|discolour|dull|under.?eye tone)/.test(text)) {
      return "Polynucleotide under-eye programme";
    }
  }

  if (
    /(jawline|chin|cheek|mid.?face)/.test(text) &&
    /(volume|projection|hollow|flatten|deflat|structural contour|recess)/.test(text)
  ) {
    return "Dermal filler contouring assessment";
  }
  if (
    /(jawline|jowl|lower.?face|mid.?face|neck)/.test(text) &&
    /(tissue descent|jowl|sag|moderate lax|loss of definition|lift)/.test(text)
  ) {
    return "PLACL thread-lift consultation";
  }
  if (
    /(jawline|lower.?face|neck|face)/.test(text) &&
    /(mild lax|reduced firmness|skin tightening|soft definition|soften|elasticity)/.test(text)
  ) {
    return "HIFU lifting consultation";
  }
  if (/pigment|uneven tone|brown patch|dark spot|photo.?damage|sun damage/.test(text)) {
    return "Q-switch laser + mesotherapy assessment";
  }
  if (/acne scar|rolling scar|boxcar|ice.?pick|enlarged pore|rough texture|uneven texture/.test(text)) {
    return "Virtue RF microneedling programme";
  }
  if (/etched line|established surface line|resurfacing|surface scarring/.test(text)) {
    return "Fractional CO2 resurfacing consultation";
  }
  if (/fine(?:\s+\w+){0,2}\s+line|pore|texture|crepiness/.test(text)) {
    return "Virtue RF microneedling programme";
  }
  if (/hydrat|dry|radiance|glow|dehydrat|dull|flat-looking/.test(text)) {
    return "Veluria skin-booster programme";
  }
  if (/diffuse dull|skin vitality|regenerative|tired-looking|collagen support/.test(text)) {
    return "PRP regenerative skin consultation";
  }
  return "Clinician assessment";
}

function normaliseItem(
  raw: Partial<ConsultationPlanItem> | undefined,
  fallback: Partial<ConsultationPlanItem>,
  review = false,
): ConsultationPlanItem {
  const source = raw ?? fallback;
  const area = clean(source.area, clean(fallback.area, "Visible facial area"));
  const concern = clean(
    source.concern,
    clean(fallback.concern, "A visible concern for the HSA clinician to assess"),
  );
  const route = treatmentRouteFor({ ...source, area, concern }, review);
  const safeRoute = SAFE_ROUTES.has(route) ? route : "Clinician assessment";
  const details = ROUTE_DETAILS[safeRoute];
  return {
    area,
    concern,
    treatmentRoute: safeRoute,
    reasoning: clean(
      source.reasoning,
      safeRoute === "Clinician assessment"
        ? "A photograph alone cannot safely determine the cause or the right treatment route."
        : "This visible pattern may be relevant to this HSA treatment route, subject to clinical assessment.",
    ),
    consultationObjective: clean(
      source.consultationObjective,
      "Confirm the cause, severity, medical suitability and safest personalised plan.",
    ),
    ...details,
  };
}

function concernFamily(areaValue: string, concernValue = ""): string {
  const text = `${areaValue} ${concernValue}`.trim().toLowerCase();
  if (/under.?eye|tear trough|lower eyelid/.test(text)) return "under-eye";
  if (/pigment|uneven tone|dark spot|photo.?damage/.test(text)) return "pigmentation";
  if (/acne|scar|texture|pore/.test(text)) return "texture-scarring";
  if (/jawline|jowl|lower.?face/.test(text)) return "lower-face";
  if (/neck/.test(text)) return "neck";
  if (/cheek|mid.?face/.test(text)) return "mid-face";
  return areaValue.trim().toLowerCase();
}

function sameArea(a: ConsultationPlanItem, b: ConsultationPlanItem) {
  return concernFamily(a.area, a.concern) === concernFamily(b.area, b.concern);
}

/** Preserve the full visible map while enforcing one primary and up to three secondary plans. */
export function normaliseConsultationAnalysis(raw: SkinAnalysis): SkinAnalysis {
  const annotations = Array.isArray(raw.annotations) ? raw.annotations : [];
  const rawPlan = raw.consultationPlan as ConsultationPlan | undefined;
  const first = annotations[0];
  const categoryScores = (Array.isArray(raw.categories) ? raw.categories : [])
    .map((category) => category?.score)
    .filter(
      (score): score is number =>
        typeof score === "number" && Number.isFinite(score),
    );
  const categoryAverage = categoryScores.length
    ? categoryScores.reduce((sum, score) => sum + score, 0) /
      categoryScores.length
    : 0;
  const healthyBaseline =
    categoryScores.length >= 5 &&
    categoryAverage >= 82 &&
    Math.min(...categoryScores) >= 76 &&
    annotations.every((annotation) => annotation.priority !== "review");

  let high = normaliseItem(rawPlan?.highPriority, first ?? {});
  if (healthyBaseline) {
    high = {
      area: "Overall visible skin quality",
      concern: "No pronounced cosmetic concern is clearly visible in this photograph.",
      treatmentRoute: "No treatment recommendation",
      reasoning:
        "The visible skin scores sit within a reassuring range, so the map should not invent a problem or push an unnecessary procedure.",
      consultationObjective:
        "Confirm whether the person wants maintenance guidance rather than corrective treatment.",
      ...ROUTE_DETAILS["No treatment recommendation"],
    };
  }

  const mediumFallbacks = annotations
    .filter((annotation) => {
      if (annotation.priority !== "medium" && annotation.priority !== "observed") {
        return false;
      }
      return (
        treatmentRouteFor({ area: annotation.area, concern: annotation.concern }) !==
        "Clinician assessment"
      );
    })
    .slice(0, 3);
  const mediumSource = Array.isArray(rawPlan?.mediumPriorities)
    ? rawPlan.mediumPriorities
    : [];
  const medium: ConsultationPlanItem[] = [];
  if (!healthyBaseline) {
    for (
      let index = 0;
      index < Math.max(mediumSource.length, mediumFallbacks.length);
      index += 1
    ) {
      const item = normaliseItem(
        mediumSource[index],
        mediumFallbacks[index] ?? {},
      );
      if (!item.area || sameArea(item, high)) continue;
      if (medium.some((existing) => sameArea(existing, item))) continue;
      medium.push(item);
      if (medium.length >= 3) break;
    }
  }

  const priorityByArea = new Map<string, "high" | "medium">([
    [concernFamily(high.area, high.concern), "high"],
    ...medium.map(
      (item) => [concernFamily(item.area, item.concern), "medium"] as const,
    ),
  ]);
  const annotationFamilies = new Set(
    annotations.map((annotation) =>
      concernFamily(clean(annotation.area), clean(annotation.concern)),
    ),
  );
  const unmatchedMediumRouteBudget = new Map<TreatmentRoute, number>();
  medium.forEach((item) => {
    if (annotationFamilies.has(concernFamily(item.area, item.concern))) return;
    unmatchedMediumRouteBudget.set(
      item.treatmentRoute,
      (unmatchedMediumRouteBudget.get(item.treatmentRoute) ?? 0) + 1,
    );
  });
  const safeAnnotations: FaceAnnotation[] = [];
  const mappedFamilies = new Set<string>();
  for (const a of annotations) {
    if (safeAnnotations.length >= 7) break;
    const area = clean(a.area, "Visible facial area");
    const concern = clean(a.concern, "Visible feature for consultation");
    const family = concernFamily(area, concern);
    // A bilateral feature is one concern area, not two different problems.
    if (mappedFamilies.has(family)) continue;
    mappedFamilies.add(family);
    const review = a.priority === "review";
    const treatment = treatmentRouteFor({ area, concern }, review);
    let priority = priorityByArea.get(family);
    if (!priority && !review) {
      const remaining = unmatchedMediumRouteBudget.get(treatment) ?? 0;
      if (remaining > 0) {
        priority = "medium";
        unmatchedMediumRouteBudget.set(treatment, remaining - 1);
      }
    }
    safeAnnotations.push({
      x: Number.isFinite(a.x) ? Math.max(0, Math.min(100, a.x)) : 50,
      y: Number.isFinite(a.y) ? Math.max(0, Math.min(100, a.y)) : 50,
      area,
      concern,
      priority: review
        ? "review"
        : priority ?? "observed",
      treatment,
      severity:
        a.severity === "notable" || a.severity === "low"
          ? a.severity
          : "moderate",
    });
  }

  const validScores = categoryScores;
  const fallbackScore = validScores.length
    ? Math.round(
        validScores.reduce((sum, score) => sum + score, 0) /
          validScores.length,
      )
    : 72;

  return {
    summary: healthyBaseline
      ? "Your photograph shows a reassuring overall visible skin baseline. No pronounced cosmetic concern is clear enough to justify a treatment recommendation from this image."
      : clean(
          raw.summary,
          "Your photograph highlights a focused visible priority for a Harley Street Aesthetics consultation. The clinician will confirm its cause, treatment suitability and the most proportionate plan.",
        ),
    categories: (Array.isArray(raw.categories) ? raw.categories : [])
      .slice(0, 5)
      .map((category) => ({
        label: clean(category.label, "Visible skin quality"),
        score:
          typeof category.score === "number" && Number.isFinite(category.score)
            ? Math.round(Math.max(0, Math.min(100, category.score)))
            : fallbackScore,
        note: clean(
          category.note,
          "This visible feature will be reviewed in context during consultation.",
        ),
      })),
    annotations: safeAnnotations,
    clinicianReview: (
      Array.isArray(raw.clinicianReview) ? raw.clinicianReview : []
    )
      .map((item) => clean(item))
      .filter(Boolean)
      .slice(0, 4),
    consultationPlan: { highPriority: high, mediumPriorities: medium },
    disclaimer: CONSULTATION_DISCLAIMER,
  };
}

export function consultationPlanSummary(plan: ConsultationPlan): string {
  return [plan.highPriority, ...plan.mediumPriorities]
    .map((item) => `${item.area}: ${item.treatmentRoute}`)
    .join("; ");
}
