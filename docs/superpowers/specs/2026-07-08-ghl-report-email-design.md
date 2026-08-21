# Email the skin-report PDF on appointment booking (via GHL)

**Date:** 2026-07-08
**Status:** Approved (pending spec review)

## Goal

When a customer books the free online phone consultation, they receive an email
— sent through GoHighLevel (GHL) — with their personalised skin-analysis report
attached as a real PDF file.

## Non-goals

- No change to how the report itself is designed (the existing client-side PDF).
- No change to the existing lead/concerns GHL webhooks (they keep working).
- No customer-facing UI change on the results page (the capture is silent).
- We do not detect the booking ourselves — GHL owns the calendar and tells us.

## Constraints / decisions (from brainstorming)

- The email is a **true attachment**, sent via the **GHL API** by our app.
- GHL detects the booking (workflow) and calls our app; our app sends the email.
- The PDF is generated in the browser today, so it must be captured server-side
  **at results time** (before the booking can happen).
- The report file is stored **inside GHL** (media library) — no external blob
  storage is introduced.

## Architecture

Three parts, each independently understandable and testable.

### Part 1 — Capture the PDF into GHL (results time)

When the results page has the analysis (and the after-image / map when ready),
the client silently builds the same PDF it already builds for download and POSTs
it, with the customer's email, to a new route:

`POST /api/report`
- body: `{ email, pdfBase64, name? }`
- server (using the GHL API):
  1. upsert the contact by email → `contactId`
  2. upload the PDF to the GHL **media library** → hosted file URL
  3. write that URL to the contact's `facial_report_pdf` custom field
- returns `{ ok: true }` (best-effort; failures are logged, never surfaced)

Re-uploads are idempotent-ish: if the after-image/map arrive after the first
upload, the client re-POSTs and the field is overwritten with the newer PDF.

### Part 2 — Detect the booking (GHL → app)

Configured by the clinic in GHL (no code):
- **Trigger:** Customer Booked Appointment (free-online-phone-consultation calendar)
- **Action:** Webhook (POST) → `https://app.drmshaclinic.com/api/appointment-booked`
- **Payload:** must include the contact id and email (and, if convenient, the
  `facial_report_pdf` field).

### Part 3 — Send the email with attachment (app → GHL API)

`POST /api/appointment-booked`
- reads `contactId` (and/or email) from the webhook body
- resolves the report URL: from the payload if present, else fetch the contact
  and read `facial_report_pdf`
- if no report URL yet → log and send the email without an attachment (or skip;
  see Edge cases)
- sends an email to the customer via the GHL Conversations API:
  `type: "Email"`, `contactId`, `subject`, `html`, `attachments: [reportUrl]`
- **de-dupes**: only one report email per contact/report (see Edge cases)
- returns `200` quickly so GHL's webhook doesn't retry

## Data flow

```
Results page ready
   │  client builds PDF (existing jsPDF)
   ▼
POST /api/report ──► GHL API: upsert contact, upload media,
                     set contact.facial_report_pdf = <media url>
   ┄┄┄ (customer later clicks "Book" → books in GHL) ┄┄┄
Booking in GHL
   │  GHL workflow: Appointment Booked → Webhook
   ▼
POST /api/appointment-booked ──► GHL API: send Email to customer,
                                 attachments: [facial_report_pdf]
   ▼
Customer inbox: email + DrMSha-Report.pdf attached
```

## New / changed code

| File | Responsibility |
|---|---|
| `lib/ghlApi.ts` (new) | Thin GHL v2 (LeadConnector) client: `upsertContact`, `uploadMedia`, `setContactField`, `getContact`, `sendEmail`. Owns auth header, base URL, version header, `locationId`. Pure functions over `fetch`; no app logic. |
| `app/api/report/route.ts` (new) | Accept `{email, pdfBase64, name?}`; orchestrate upsert → upload → set field. Best-effort, always 200 to the client. |
| `app/api/appointment-booked/route.ts` (new) | Webhook handler; resolve report URL; send email; de-dupe; always 200. |
| `lib/download.ts` (change) | Extract `buildAnalysisPdf(opts) → jsPDF doc` so the bytes can be produced without triggering a download. `downloadAnalysisPdf` stays (calls the builder then `.save()`); add `buildAnalysisPdfBase64(opts)` for upload. |
| `components/AnalysisReport.tsx` (change) | On results-ready (analysis present; re-run when after/map arrive), silently build the PDF and POST to `/api/report`. Fire-and-forget; never blocks or shows errors. |
| `lib/legal.ts` (reuse) | `DISCLAIMER_FULL` is included in the email body. |

## GHL API usage (to verify against current GHL docs during build)

- Base: `https://services.leadconnector.com`
- Auth: `Authorization: Bearer <GHL_API_KEY>`, `Version: 2021-07-28`
- Contacts: upsert (`POST /contacts/upsert`), get (`GET /contacts/{id}`),
  update field (`PUT /contacts/{id}` with `customFields`)
- Custom field id: look up once via `GET /locations/{locationId}/customFields`
  and match the key `facial_report_pdf` → its field id (cache in module scope).
- Media: `POST /medias/upload-file` (multipart) → hosted URL.
- Email: `POST /conversations/messages` with `type: "Email"`, `contactId`,
  `subject`, `html`, `attachments: [url]`.

Exact request/response shapes will be confirmed by fetching GHL's API docs
during implementation; the client in `lib/ghlApi.ts` isolates any adjustments.

## Config / env vars

| Var | Value | Notes |
|---|---|---|
| `GHL_API_KEY` | (provided out-of-band) | Private Integration token; set in Vercel + `.env.local`. Never committed. |
| `GHL_LOCATION_ID` | `XnwkbaimNt2dfzDG3w4K` | |
| `GHL_REPORT_FIELD_KEY` | `facial_report_pdf` | The contact custom-field key. |
| `GHL_API_BASE` | `https://services.leadconnector.com` | Optional override; default in code. |

The existing `GHL_WEBHOOK_URL` (inbound webhook) is unchanged and independent.

## Email content (draft, for approval)

- **Subject:** `Your personalised skin report — Dr.M.Sha Wellness & Aesthetics Clinic`
- **From:** the GHL location's configured email (default).
- **Body (HTML):**
  > Hi {firstName},
  >
  > Thank you for booking your free online phone consultation with Dr.M.Sha
  > Wellness & Aesthetics Clinic. Your personalised skin report is attached as a
  > PDF for you to keep — it includes your skin analysis, treatment map, and a
  > before/after preview.
  >
  > _{DISCLAIMER_FULL}_
  >
  > We look forward to speaking with you.
  > — Dr.M.Sha Wellness & Aesthetics Clinic

## Error handling & edge cases

- **Never block the customer.** `/api/report` is fire-and-forget; any GHL failure
  is logged and the results page is unaffected.
- **Booking before the PDF exists** (customer books in the seconds before the
  after-image finishes): the `facial_report_pdf` field may be empty when the
  booking webhook fires. Handling: send the email anyway with whatever report is
  stored; if none is stored yet, send the email **without** the attachment and
  log it (the customer still gets a booking confirmation email; the report was an
  add-on). The client uploads as soon as the analysis text is ready — before the
  images — so an empty field is unlikely.
- **Duplicate webhooks:** GHL may retry. De-dupe with a **contact tag**
  (`facial-report-emailed`) — no extra custom field needed: on receipt, fetch the
  contact's tags; if the tag is present, skip; otherwise send the email, then add
  the tag via the API. This survives across serverless invocations because the
  state lives on the GHL contact.
- **Missing contact / bad payload:** return 200 with a logged warning so GHL does
  not hammer retries; nothing to send.
- **Large PDF:** the PDF is ~0.2–0.5 MB (JPEG-encoded images), well within limits.

## What the clinic configures in GHL (no code)

1. Provide the `GHL_API_KEY` (Private Integration token) with scopes: Medias
   (write), Contacts (read + write), Conversations / Conversations Messages
   (write). ✅ provided
2. Ensure the `facial_report_pdf` contact custom field exists. ✅ exists
3. Build the workflow: **Appointment Booked** (free-online-phone-consultation) →
   **Webhook (POST)** to `https://app.drmshaclinic.com/api/appointment-booked`,
   including contact id + email in the payload.

## Security

- The Private Integration token is stored only in environment variables
  (`GHL_API_KEY`), never in source or the repo. It was shared in chat, so
  rotating it after go-live is recommended.
- `/api/appointment-booked` is a public endpoint. It performs no destructive
  action and only sends a templated email to the contact GHL names, so the blast
  radius is low. Optional hardening: verify a shared secret query param /
  header that the GHL workflow includes (`?key=…`) — recommended, cheap to add.

## Testing plan

- `lib/ghlApi.ts`: unit-test request shaping (URL, headers, body) with `fetch`
  mocked.
- `/api/report`: post a small PDF with a test email; assert the three GHL calls
  fire in order; assert best-effort 200 on GHL failure.
- `/api/appointment-booked`: simulate the webhook; assert email send call with
  the right `attachments`; assert de-dupe on a second identical webhook; assert
  graceful handling when the field is empty.
- End-to-end (manual, staging): run a real analysis on the deployed site, confirm
  the contact's `facial_report_pdf` is populated, then trigger a test booking and
  confirm the email arrives with the PDF attached.

## Open items (need clinic confirmation)

- Approve the email subject/body copy above.
- Confirm the "from" sender (default = location email) is acceptable.
- Decide whether to add the optional shared-secret guard on the webhook
  (recommended).
