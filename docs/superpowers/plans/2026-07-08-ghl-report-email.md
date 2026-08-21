# Email skin-report PDF on appointment booking (GHL) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a customer books the consultation, email them their skin-report PDF as a true attachment, sent via the GoHighLevel (GHL) API.

**Architecture:** The browser captures the already-built PDF to `POST /api/report` at results time; the server uploads it to the GHL media library and stores the URL on the contact's `facial_report_pdf` field. A GHL "Appointment Booked" workflow calls `POST /api/appointment-booked`, which sends the customer an email via the GHL Conversations API with the PDF attached, de-duped by a contact tag.

**Tech Stack:** Next.js 15 App Router (Node runtime routes), TypeScript, jsPDF (existing, client-side), GHL v2 (LeadConnector) REST API.

## Global Constraints

- All new API routes use `export const runtime = "nodejs"`.
- GHL v2 API: base `https://services.leadconnector.com`; every request sends headers `Authorization: Bearer <GHL_API_KEY>`, `Version: 2021-07-28`, `Accept: application/json` (and `Content-Type: application/json` for JSON bodies).
- Location ID: `XnwkbaimNt2dfzDG3w4K` (via `GHL_LOCATION_ID`).
- Report custom-field key: `facial_report_pdf` (via `GHL_REPORT_FIELD_KEY`).
- De-dupe tag: `facial-report-emailed`.
- Secrets ONLY in env vars — never in source, never committed. `.env.local` is gitignored.
- Every GHL interaction is **best-effort**: log on failure, never break the customer's flow, always return a fast 2xx to webhooks so GHL does not retry-storm.
- **Do NOT push to git until the user explicitly says so.** Local commits per task are fine.
- **Testing approach (deliberate deviation from unit-TDD):** this repo has no test framework and is verified end-to-end (Playwright, curl, real artifacts) — the pattern used throughout this project. The highest-risk surface here is the live third-party GHL API, which mocked unit tests cannot de-risk. So each task is verified with **live calls** (a throwaway node script hitting real GHL with the provided token, or curl against the dev server), then the throwaway verification is deleted. No test framework is introduced.

---

### Task 1: GHL API client (`lib/ghlApi.ts`)

A thin, isolated client over `fetch`. All GHL request/response specifics live here so the routes stay clean and any API-shape surprises are fixed in one file.

**Files:**
- Create: `lib/ghlApi.ts`
- Create (throwaway, deleted in Step 5): `scripts/ghl-verify.mjs`
- Modify: `.env.local.example`

**Interfaces:**
- Produces:
  - `upsertContact(input: { email: string; name?: string }): Promise<string>` → returns `contactId`
  - `getReportFieldId(): Promise<string | null>` → resolves the custom-field id for key `facial_report_pdf`
  - `uploadMedia(bytes: Buffer, filename: string): Promise<string>` → returns hosted HTTPS URL
  - `setContactReportUrl(contactId: string, url: string): Promise<void>`
  - `getContact(contactId: string): Promise<{ id: string; email?: string; tags: string[]; reportUrl?: string }>`
  - `addContactTag(contactId: string, tag: string): Promise<void>`
  - `sendEmail(input: { contactId: string; subject: string; html: string; attachments?: string[] }): Promise<void>`

- [ ] **Step 1: Write the client**

Create `lib/ghlApi.ts`:

```ts
const BASE = process.env.GHL_API_BASE ?? "https://services.leadconnector.com";
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? "";
const FIELD_KEY = process.env.GHL_REPORT_FIELD_KEY ?? "facial_report_pdf";

function token(): string {
  const t = process.env.GHL_API_KEY;
  if (!t) throw new Error("GHL_API_KEY is not set");
  return t;
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token()}`,
    Version: "2021-07-28",
    Accept: "application/json",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function ghl(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL ${init.method} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

/** Upsert a contact by email; returns the contactId. */
export async function upsertContact(input: {
  email: string;
  name?: string;
}): Promise<string> {
  const [firstName, ...rest] = (input.name ?? "").trim().split(/\s+/).filter(Boolean);
  const res = await ghl("/contacts/upsert", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      locationId: LOCATION_ID,
      email: input.email.trim().toLowerCase(),
      ...(firstName ? { firstName } : {}),
      ...(rest.length ? { lastName: rest.join(" ") } : {}),
    }),
  });
  const data = (await res.json()) as { contact?: { id?: string } };
  const id = data.contact?.id;
  if (!id) throw new Error("GHL upsert returned no contact id");
  return id;
}

/** Resolve the custom-field id for FIELD_KEY (cached in module scope). */
let cachedFieldId: string | null | undefined;
export async function getReportFieldId(): Promise<string | null> {
  if (cachedFieldId !== undefined) return cachedFieldId;
  const res = await ghl(`/locations/${LOCATION_ID}/customFields`, {
    method: "GET",
    headers: headers(false),
  });
  const data = (await res.json()) as {
    customFields?: Array<{ id: string; fieldKey?: string; name?: string }>;
  };
  const match = (data.customFields ?? []).find(
    (f) => f.fieldKey === `contact.${FIELD_KEY}` || f.fieldKey === FIELD_KEY,
  );
  cachedFieldId = match?.id ?? null;
  return cachedFieldId;
}

/** Upload a file to the GHL media library; returns the hosted HTTPS URL. */
export async function uploadMedia(bytes: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), filename);
  form.append("locationId", LOCATION_ID);
  const res = await ghl("/medias/upload-file", {
    method: "POST",
    headers: headers(false), // let fetch set multipart Content-Type
    body: form,
  });
  const data = (await res.json()) as { url?: string; fileUrl?: string; fileId?: string };
  const url = data.url ?? data.fileUrl;
  if (!url) throw new Error(`GHL media upload returned no url: ${JSON.stringify(data)}`);
  return url;
}

/** Write the report URL onto the contact's custom field. */
export async function setContactReportUrl(contactId: string, url: string): Promise<void> {
  const fieldId = await getReportFieldId();
  const customFields = fieldId
    ? [{ id: fieldId, field_value: url }]
    : [{ key: FIELD_KEY, field_value: url }];
  await ghl(`/contacts/${contactId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ customFields }),
  });
}

/** Fetch a contact: id, email, tags, and the stored report URL. */
export async function getContact(contactId: string): Promise<{
  id: string;
  email?: string;
  tags: string[];
  reportUrl?: string;
}> {
  const res = await ghl(`/contacts/${contactId}`, {
    method: "GET",
    headers: headers(false),
  });
  const data = (await res.json()) as {
    contact?: {
      id: string;
      email?: string;
      tags?: string[];
      customFields?: Array<{ id?: string; key?: string; value?: string; field_value?: string }>;
    };
  };
  const c = data.contact;
  if (!c) throw new Error("GHL getContact returned no contact");
  const fieldId = await getReportFieldId();
  const cf = (c.customFields ?? []).find(
    (f) => (fieldId && f.id === fieldId) || f.key === FIELD_KEY,
  );
  return {
    id: c.id,
    email: c.email,
    tags: c.tags ?? [],
    reportUrl: cf?.value ?? cf?.field_value,
  };
}

/** Add a tag to a contact (used for send de-dupe). */
export async function addContactTag(contactId: string, tag: string): Promise<void> {
  await ghl(`/contacts/${contactId}/tags`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ tags: [tag] }),
  });
}

/** Send an email to a contact via the Conversations API. */
export async function sendEmail(input: {
  contactId: string;
  subject: string;
  html: string;
  attachments?: string[];
}): Promise<void> {
  await ghl("/conversations/messages", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "Email",
      contactId: input.contactId,
      subject: input.subject,
      html: input.html,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    }),
  });
}
```

- [ ] **Step 2: Document env vars**

Append to `.env.local.example`:

```
# GoHighLevel API (report-email-on-booking feature)
GHL_API_KEY=              # Private Integration token (pit-...). Never commit.
GHL_LOCATION_ID=XnwkbaimNt2dfzDG3w4K
GHL_REPORT_FIELD_KEY=facial_report_pdf
GHL_WEBHOOK_SECRET=       # shared secret in the GHL booking webhook URL (?key=...)
# GHL_API_BASE=https://services.leadconnector.com  # optional override
```

- [ ] **Step 3: Live-verify the client shapes against real GHL**

Create `scripts/ghl-verify.mjs` (throwaway) that exercises the read paths and a safe upsert against a test email, printing raw responses so we confirm field names (`contact.id`, `customFields[].fieldKey`, media `url`, etc.). Load env from `.env.local`.

```js
import "dotenv/config";

const BASE = "https://services.leadconnector.com";
const H = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: "2021-07-28",
  Accept: "application/json",
};
const LOC = process.env.GHL_LOCATION_ID;

const cf = await fetch(`${BASE}/locations/${LOC}/customFields`, { headers: H });
console.log("customFields status", cf.status);
const cfj = await cf.json();
console.log(JSON.stringify(cfj, null, 2).slice(0, 2000));

const up = await fetch(`${BASE}/contacts/upsert`, {
  method: "POST",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ locationId: LOC, email: "ghl-verify@example.com", firstName: "Verify" }),
});
console.log("upsert status", up.status);
console.log(JSON.stringify(await up.json(), null, 2).slice(0, 1500));
```

- [ ] **Step 4: Run the verification and reconcile**

Run: `node scripts/ghl-verify.mjs`
Expected: HTTP 200s; a `customFields` array containing an entry whose `fieldKey` is `contact.facial_report_pdf` (note its `id`); an `upsert` response with `contact.id`.
If any field name differs from the client above (e.g. media `url` key, custom-field value key, tags path), fix `lib/ghlApi.ts` to match the real shapes, then re-run.

- [ ] **Step 5: Delete the throwaway script and commit**

```bash
rm scripts/ghl-verify.mjs
git add lib/ghlApi.ts .env.local.example
git commit -m "feat: GHL v2 API client for the report-email feature"
```

---

### Task 2: `POST /api/report` — capture the PDF into GHL

**Files:**
- Modify: `lib/download.ts` (extract a base64 builder from `downloadAnalysisPdf`)
- Create: `app/api/report/route.ts`

**Interfaces:**
- Consumes: `lib/ghlApi.ts` (`upsertContact`, `uploadMedia`, `setContactReportUrl`)
- Produces:
  - `lib/download.ts`: `buildAnalysisPdfBase64(opts: PdfOpts): Promise<string>` (base64, no data-URL prefix)
  - Route: `POST /api/report` accepting `{ email, pdfBase64, name? }` → `{ ok: true }`

- [ ] **Step 1: Refactor `lib/download.ts` to expose the PDF bytes**

In `lib/download.ts`, split the builder from the save. Extract everything in `downloadAnalysisPdf` that builds `doc` (up to just before the `try { doc.save(...) }`) into a new exported async function, and have both the download path and the new base64 path reuse it.

```ts
export interface PdfOpts {
  analysis: SkinAnalysis;
  before: string;
  after: string | null;
  map: string | null;
}

/** Builds the branded jsPDF document (no download side effect). */
async function buildAnalysisPdfDoc(opts: PdfOpts) {
  const { analysis, before, after, map } = opts;
  const beforeAfter = after ? await composeBeforeAfter(before, after) : null;
  const mapJpeg = map ? await toJpegDataUrl(map) : null;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  // ... (ALL existing layout code from downloadAnalysisPdf, unchanged,
  //      ending after the final disclaimerBox() — but WITHOUT the doc.save block) ...
  return doc;
}

/** Base64 (no data-URL prefix) of the report PDF — for server upload. */
export async function buildAnalysisPdfBase64(opts: PdfOpts): Promise<string> {
  const doc = await buildAnalysisPdfDoc(opts);
  return doc.output("datauristring").split(",")[1] ?? "";
}

export async function downloadAnalysisPdf(opts: PdfOpts): Promise<void> {
  const doc = await buildAnalysisPdfDoc(opts);
  try {
    doc.save("DrMSha-Skin-Consultation.pdf");
  } catch {
    window.open(doc.output("bloburl"), "_blank");
  }
}
```

Update the existing `downloadAnalysisPdf` signature usages to the shared `PdfOpts` type (no call-site change needed — same fields).

- [ ] **Step 2: Create the route**

Create `app/api/report/route.ts`:

```ts
import { NextResponse } from "next/server";
import { upsertContact, uploadMedia, setContactReportUrl } from "@/lib/ghlApi";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { email?: unknown; pdfBase64?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64 : "";
  const name = typeof body.name === "string" ? body.name : undefined;
  if (!email || !pdfBase64) {
    return NextResponse.json({ error: "email and pdfBase64 are required." }, { status: 400 });
  }
  if (!process.env.GHL_API_KEY) {
    console.warn("[report] GHL_API_KEY not set — skipping report capture.");
    return NextResponse.json({ ok: true });
  }

  // Best-effort: never surface a failure to the client's results page.
  try {
    const contactId = await upsertContact({ email, name });
    const url = await uploadMedia(Buffer.from(pdfBase64, "base64"), "DrMSha-Skin-Consultation.pdf");
    await setContactReportUrl(contactId, url);
  } catch (err) {
    console.error("[report] GHL capture failed:", err);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Live-verify the route against real GHL**

Start the dev server (`npm run dev`). Build a tiny base64 PDF inline and POST it:

Run:
```bash
node -e "const b=Buffer.from('%PDF-1.3\n%%EOF').toString('base64');fetch('http://localhost:3000/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ghl-verify@example.com',name:'Verify Test',pdfBase64:b})}).then(r=>r.json()).then(console.log)"
```
Expected: `{ ok: true }`, and in GHL the `ghl-verify@example.com` contact's **Facial Report Pdf** field is now populated with a media URL (check in GHL, or re-run `getContact` via a one-off node call). If the media upload or field write errors, read the server log and fix `lib/ghlApi.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/download.ts app/api/report/route.ts
git commit -m "feat: /api/report captures the report PDF into GHL"
```

---

### Task 3: Auto-upload the report from the results page

**Files:**
- Modify: `components/AnalysisReport.tsx`

**Interfaces:**
- Consumes: `lib/download.ts` (`buildAnalysisPdfBase64`)
- Consumes (new prop): the customer's email + name, passed from `app/page.tsx`
- Produces: a silent `POST /api/report` when results are ready (and again when the after-image/map arrive)

- [ ] **Step 1: Thread the lead email/name into the report**

In `app/page.tsx`, the `result` step renders `<AnalysisReport ... />`. Pass the lead's email and name (already in state as `lead`):

```tsx
{step === "result" && analysis && selfie && (
  <AnalysisReport
    key="result"
    before={selfie}
    after={afterImage}
    afterPending={afterPending}
    mapImage={mapImage}
    mapPending={mapPending}
    analysis={analysis}
    email={lead?.email ?? null}
    name={lead?.name ?? null}
    onRestart={reset}
  />
)}
```

Add `email` and `name` to the `AnalysisReport` prop type in `components/AnalysisReport.tsx`:

```tsx
  email,
  name,
  ...
}: {
  before: string;
  after: string | null;
  afterPending: boolean;
  mapImage: string | null;
  mapPending: boolean;
  analysis: SkinAnalysis;
  email?: string | null;
  name?: string | null;
  onRestart: () => void;
}) {
```

- [ ] **Step 2: Add the silent upload effect**

In `components/AnalysisReport.tsx`, add an effect that builds the PDF and POSTs it whenever the report content changes, so the stored copy stays current as the after-image/map arrive. Guard against duplicate identical uploads with a ref.

```tsx
import { buildAnalysisPdfBase64 } from "@/lib/download";
// ...
const lastUploadKey = useRef<string>("");
useEffect(() => {
  if (!email || !before) return;
  // Re-upload only when the meaningful inputs change.
  const key = `${email}|${after ? "a" : ""}|${mapImage ? "m" : ""}`;
  if (key === lastUploadKey.current) return;
  lastUploadKey.current = key;
  let cancelled = false;
  (async () => {
    try {
      const pdfBase64 = await buildAnalysisPdfBase64({
        analysis,
        before,
        after,
        map: mapImage,
      });
      if (cancelled) return;
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, pdfBase64 }),
      });
    } catch {
      /* best-effort; never disrupt the results page */
    }
  })();
  return () => {
    cancelled = true;
  };
}, [email, name, before, after, mapImage, analysis]);
```

- [ ] **Step 3: Verify the auto-upload in the browser**

Recreate the temporary test page pattern used earlier (`app/pdf-test-tmp/page.tsx` rendering `AnalysisReport` with a mock analysis and an `email="ghl-verify@example.com"`), load it, and confirm in the Network tab that `POST /api/report` fires and returns `{ ok: true }`. Confirm the GHL contact's field updates. Delete the temp page afterward.

- [ ] **Step 4: Commit**

```bash
git add components/AnalysisReport.tsx app/page.tsx
git commit -m "feat: results page silently uploads the report PDF to GHL"
```

---

### Task 4: `POST /api/appointment-booked` — send the email with attachment

**Files:**
- Create: `app/api/appointment-booked/route.ts`
- Create: `lib/reportEmail.ts` (email subject + HTML body)

**Interfaces:**
- Consumes: `lib/ghlApi.ts` (`getContact`, `sendEmail`, `addContactTag`), `lib/legal.ts` (`DISCLAIMER_FULL`)
- Produces:
  - `lib/reportEmail.ts`: `reportEmail(firstName: string): { subject: string; html: string }`
  - Route: `POST /api/appointment-booked?key=<secret>` accepting a GHL webhook body containing at least `contactId` (or `contact_id`) → `{ ok: true }`

- [ ] **Step 1: Email copy module**

Create `lib/reportEmail.ts`:

```ts
import { DISCLAIMER_FULL } from "./legal";

export function reportEmail(firstName: string): { subject: string; html: string } {
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  return {
    subject:
      "Your personalised skin report — Dr.M.Sha Wellness & Aesthetics Clinic",
    html: `
<div style="font-family:Helvetica,Arial,sans-serif;color:#2b2b2b;line-height:1.6;font-size:15px">
  <p>${hi}</p>
  <p>Thank you for booking your free online phone consultation with
  <strong>Dr.M.Sha Wellness &amp; Aesthetics Clinic</strong>. Your personalised
  skin report is attached as a PDF for you to keep — it includes your skin
  analysis, treatment map, and a before/after preview.</p>
  <p style="font-size:12px;color:#8a6d3b;background:#fcf6e8;border:1px solid #e6cf8f;border-radius:8px;padding:10px 12px">
    ${DISCLAIMER_FULL}
  </p>
  <p>We look forward to speaking with you.<br/>— Dr.M.Sha Wellness &amp; Aesthetics Clinic</p>
</div>`.trim(),
  };
}
```

- [ ] **Step 2: Create the webhook route**

Create `app/api/appointment-booked/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getContact, sendEmail, addContactTag } from "@/lib/ghlApi";
import { reportEmail } from "@/lib/reportEmail";

export const runtime = "nodejs";
export const maxDuration = 30;

const SENT_TAG = "facial-report-emailed";

function pickContactId(body: Record<string, unknown>): string {
  const cands = [body.contactId, body.contact_id, body.contact, body.id];
  for (const c of cands) if (typeof c === "string" && c) return c;
  // GHL sometimes nests under `contact`.
  const nested = body.contact as { id?: unknown } | undefined;
  if (nested && typeof nested.id === "string") return nested.id;
  return "";
}

export async function POST(req: Request) {
  // Shared-secret guard: only GHL (which includes ?key=) may trigger sends.
  const url = new URL(req.url);
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (secret && url.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true }); // don't make GHL retry a bad body
  }

  const contactId = pickContactId(body);
  if (!contactId || !process.env.GHL_API_KEY) {
    console.warn("[booking] missing contactId or GHL_API_KEY — nothing to send.");
    return NextResponse.json({ ok: true });
  }

  try {
    const contact = await getContact(contactId);
    if (contact.tags.includes(SENT_TAG)) {
      return NextResponse.json({ ok: true, deduped: true }); // already emailed
    }
    const firstName =
      typeof body.firstName === "string" ? body.firstName : "";
    const { subject, html } = reportEmail(firstName);
    await sendEmail({
      contactId,
      subject,
      html,
      attachments: contact.reportUrl ? [contact.reportUrl] : undefined,
    });
    await addContactTag(contactId, SENT_TAG);
    if (!contact.reportUrl) {
      console.warn(`[booking] contact ${contactId} had no report URL — sent without attachment.`);
    }
  } catch (err) {
    console.error("[booking] send failed:", err);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Live-verify the send end-to-end**

Ensure the `ghl-verify@example.com` contact has a report URL (from Task 2) and does NOT yet have the `facial-report-emailed` tag. With the dev server running and `GHL_WEBHOOK_SECRET` set in `.env.local`, simulate the booking webhook:

Run:
```bash
node -e "fetch('http://localhost:3000/api/appointment-booked?key='+process.env.GHL_WEBHOOK_SECRET,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contactId:'<PASTE_CONTACT_ID>',firstName:'Verify'})}).then(r=>r.json()).then(console.log)" 
```
(Load env first, e.g. prefix with the dotenv trick or export `GHL_WEBHOOK_SECRET`.)
Expected: `{ ok: true }`; the email appears in the contact's GHL conversation thread with the PDF attached; the contact gains the `facial-report-emailed` tag. Re-run once → expect `{ ok: true, deduped: true }` and NO second email.

- [ ] **Step 4: Verify the secret guard**

Run the same call with a wrong `?key=nope`.
Expected: HTTP 401, no email sent.

- [ ] **Step 5: Commit**

```bash
git add app/api/appointment-booked/route.ts lib/reportEmail.ts
git commit -m "feat: /api/appointment-booked emails the report PDF on booking"
```

---

### Task 5: Env + GHL setup docs and final cleanup

**Files:**
- Create: `docs/ghl-report-email-setup.md`
- Verify: `.env.local` has all four vars locally (not committed)

- [ ] **Step 1: Write the clinic-facing setup doc**

Create `docs/ghl-report-email-setup.md` with the exact GHL workflow configuration:

```markdown
# GHL setup — email the skin report on booking

Environment variables (Vercel → Project → Settings, and local `.env.local`):
- `GHL_API_KEY` = the Private Integration token (pit-...)
- `GHL_LOCATION_ID` = XnwkbaimNt2dfzDG3w4K
- `GHL_REPORT_FIELD_KEY` = facial_report_pdf
- `GHL_WEBHOOK_SECRET` = <pick a long random string; used in the webhook URL>

Workflow in GHL:
1. Trigger: **Customer Booked Appointment** — filter to the
   "free-online-phone-consultation" calendar.
2. Action: **Webhook** — POST to:
   `https://app.drmshaclinic.com/api/appointment-booked?key=<GHL_WEBHOOK_SECRET>`
   Include in the payload at least: contact id (`contactId`) and, if available,
   `firstName`.
3. Save & publish.

The report PDF is captured automatically when the customer views their results,
so by the time they book, their contact's "Facial Report Pdf" field is populated
and the email is sent with the PDF attached.
```

- [ ] **Step 2: Confirm local env and a clean working tree**

Run: `git status`
Expected: only the intended files changed across the tasks; `.env.local` is NOT listed (gitignored); no `scripts/ghl-verify.mjs` or temp test page remains.

- [ ] **Step 3: Full typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/ghl-report-email-setup.md
git commit -m "docs: GHL workflow setup for report-email-on-booking"
```

---

## Self-Review

- **Spec coverage:** Part 1 (capture) → Tasks 2–3; Part 2 (detect) → Task 5 workflow doc + Task 4 secret; Part 3 (send) → Task 4; GHL client → Task 1; email copy → Task 4; env/config → Tasks 1 & 5; de-dupe tag → Task 4; edge cases (missing URL, bad payload, dedupe) → Task 4; security (secret, env-only token) → Tasks 1, 4, 5. Covered.
- **Placeholders:** the only `<...>` are runtime values a human pastes (contact id, secret) — not plan gaps.
- **Type consistency:** `buildAnalysisPdfBase64`/`PdfOpts` defined in Task 2 and consumed in Task 3; `getContact`→`reportUrl`/`tags`, `sendEmail`, `addContactTag` defined in Task 1 and consumed in Task 4. Consistent.

## Notes / risks

- GHL response field names (media `url`, custom-field value key, tags endpoint) are verified live in Task 1 Step 4 and Task 2 Step 3; the client is the single place to reconcile any differences.
- Timing: capture happens at results time, before booking; the empty-URL path in Task 4 is the safety net.
