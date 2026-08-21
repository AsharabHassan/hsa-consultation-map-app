import { NextResponse } from "next/server";
import {
  buildEventPayload,
  configuredWebhookUrl,
  parseGhlMeta,
} from "@/lib/ghl";

export const runtime = "nodejs";

/** Only events this app fires. An open string field would let anything through. */
const ALLOWED = new Set([
  "ConsultationMapViewed",
  "BookingClicked",
  "ReportCompleted",
]);

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Results-page funnel events, mirrored into GHL so they land on the contact's
 * timeline alongside the lead and the analysis.
 *
 * Measures whether a completed map became a consultation click. Because the
 * events carry the email, they can be joined against who actually attended.
 *
 * Best-effort by design — usually arrives via sendBeacon, whose response
 * nobody reads. A failure here must never surface to the client.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const email = str(body.email).toLowerCase();
  const event = str(body.event);
  if (!email || !ALLOWED.has(event)) {
    return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  }

  const url = configuredWebhookUrl();
  const meta = parseGhlMeta(body.meta, req);
  const payload = buildEventPayload(
    email,
    event,
    {
      plan: str(body.plan),
      focus: str(body.focus),
      placement: str(body.placement),
    },
    meta,
  );

  if (!url) {
    console.warn("[event] GHL_WEBHOOK_URL is not configured; event push skipped.");
    return NextResponse.json({ ok: true });
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[event] GHL push failed:", err);
  }

  // Always 200: the client cannot act on a failure and sendBeacon ignores this.
  return NextResponse.json({ ok: true });
}
