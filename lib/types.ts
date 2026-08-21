export type SkinGoal =
  | "Dark circles & under-eyes"
  | "Acne scarring & texture"
  | "Pigmentation & uneven tone"
  | "Jawline definition & jowls"
  | "Lower-face or neck laxity"
  | "Volume loss & facial contour"
  | "Fine lines & skin quality"
  | "Hydration & radiance"
  | "I am not sure";

export interface LeadPayload {
  name: string;
  email: string;
  phone: string;
  goals: SkinGoal[];
  consent: boolean;
}

export interface AnalysisCategory {
  label: string;
  score: number;
  note: string;
}

export type ConsultationPriority = "high" | "medium" | "observed" | "review";

export type TreatmentRoute =
  | "Polynucleotide under-eye programme"
  | "Fractional CO2 eye consultation"
  | "Dermal filler contouring assessment"
  | "PLACL thread-lift consultation"
  | "HIFU lifting consultation"
  | "Virtue RF microneedling programme"
  | "Fractional CO2 resurfacing consultation"
  | "Q-switch laser + mesotherapy assessment"
  | "Veluria skin-booster programme"
  | "PRP regenerative skin consultation"
  | "No treatment recommendation"
  | "Clinician assessment";

export interface ConsultationPlanItem {
  area: string;
  concern: string;
  treatmentRoute: TreatmentRoute;
  reasoning: string;
  consultationObjective: string;
  expectedDirection: string;
  typicalJourney: string;
  priceGuide: string;
}

export interface ConsultationPlan {
  highPriority: ConsultationPlanItem;
  mediumPriorities: ConsultationPlanItem[];
}

export interface FaceAnnotation {
  x: number;
  y: number;
  area: string;
  concern: string;
  priority: ConsultationPriority;
  treatment: TreatmentRoute;
  severity: "low" | "moderate" | "notable";
}

export interface SkinAnalysis {
  summary: string;
  categories: AnalysisCategory[];
  annotations: FaceAnnotation[];
  clinicianReview: string[];
  consultationPlan: ConsultationPlan;
  disclaimer: string;
}
