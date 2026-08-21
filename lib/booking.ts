import type { ConsultationPlan } from "./types";
import { consultationPlanSummary } from "./consultation";

export type CtaPlacement = "priority" | "map" | "footer" | "sticky";

export interface BookingContext {
  plan: ConsultationPlan;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  placement: CtaPlacement;
}

export function planSummary(plan: ConsultationPlan): string {
  return consultationPlanSummary(plan);
}

export function bookingUrl(base: string, context: BookingContext): string {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return base;
  }
  const set = (key: string, value: string | null | undefined) => {
    const safe = (value ?? "").trim();
    if (safe) url.searchParams.set(key, safe);
  };
  const [first, ...rest] = (context.name ?? "").trim().split(/\s+/);
  set("first_name", first);
  set("last_name", rest.join(" "));
  set("email", context.email);
  set("phone", context.phone);
  set("plan", planSummary(context.plan));
  set("focus", context.plan.highPriority.area);
  set("utm_source", "hsa-facial-analysis");
  set("utm_medium", "hsa-consultation-map");
  set("utm_content", context.placement);
  return url.toString();
}
