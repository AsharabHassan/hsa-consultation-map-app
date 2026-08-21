import { NextResponse } from "next/server";
import {
  upsertContact,
  uploadMedia,
  setContactReportUrl,
  sendEmail,
} from "@/lib/ghlApi";
import { reportEmail } from "@/lib/reportEmail";

export const runtime = "nodejs";
export const maxDuration = 30;

function hasUsableGhlApiKey(): boolean {
  const key = (process.env.GHL_API_KEY ?? process.env.GHL_API_TOKEN)?.trim();
  return Boolean(key && key !== "[SENSITIVE]");
}

/**
 * Captures the customer's report PDF into GHL at results time and — once the
 * report is finalised — emails it to the customer with a "book your free
 * consultation" CTA. Sent BEFORE booking, by the app; GHL handles its own
 * booking-confirmation emails separately. Sent on EVERY completed analysis (no
 * per-contact de-dupe) — the same email may be reused for a different person's
 * photo, and each of those is a genuinely new report. The client fires the
 * emailing request once per finished analysis. Best-effort: never surfaces a
 * failure.
 */
export async function POST(req: Request) {
  let body: {
    email?: unknown;
    pdfBase64?: unknown;
    name?: unknown;
    sendEmail?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64 : "";
  const name = typeof body.name === "string" ? body.name : undefined;
  // The client sets this true once the map has settled, so the emailed PDF is
  // the final consultation-map version.
  const shouldEmail = body.sendEmail === true;
  if (!email || !pdfBase64) {
    return NextResponse.json(
      { error: "email and pdfBase64 are required." },
      { status: 400 },
    );
  }
  if (!hasUsableGhlApiKey()) {
    console.warn("[report] HSA GHL API credentials are not configured; report delivery skipped.");
    return NextResponse.json({ ok: true });
  }

  try {
    const contactId = await upsertContact({ email, name });
    const url = await uploadMedia(
      Buffer.from(pdfBase64, "base64"),
      "HSA-Facial-Consultation-Map.pdf",
    );
    await setContactReportUrl(contactId, url);

    // Email the finished report (with the book-now CTA) on every completed
    // analysis — no de-dupe, so a repeat submission (e.g. same email, a
    // different person's photo) still gets its own report.
    if (shouldEmail) {
      const firstName = (name ?? "").trim().split(/\s+/)[0] ?? "";
      const { subject, html } = reportEmail(firstName);
      await sendEmail({ contactId, subject, html, attachments: [url] });
    }
  } catch (err) {
    // Log and swallow — the customer's results page must never be affected.
    console.error("[report] GHL capture/send failed:", err);
  }
  return NextResponse.json({ ok: true });
}
