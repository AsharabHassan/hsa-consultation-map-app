# HSA Consultation Map — Harley Street Aesthetics

A complimentary AI facial-consultation lead magnet for **Harley Street Aesthetics
(Dr M. Shah)**. A visitor takes one photo and receives a consultant-grade
"Facial Concern & Technology Map": Claude vision identifies **one primary and up
to three secondary facial priorities**, an annotated consultation map is rendered
over their photo (OpenAI image edit, with a local pin-overlay fallback), and the
finished report is captured as a PDF in GoHighLevel and emailed with a
book-your-free-consultation CTA. Leads are pushed to GHL with Meta Conversions
API attribution.

Treatment suitability is always reserved for the HSA clinician — the report
records visible observations only and ends at a clinician-review boundary.

Built with **Next.js 15 (App Router)** and **Tailwind CSS**. Zero-config on Vercel.

## Tech

- Next.js 15 / React 19 / TypeScript
- Tailwind CSS
- `@anthropic-ai/sdk` — `claude-sonnet-5` vision for the written assessment (`/api/analyze`)
- `openai` — `gpt-image-2` edit for the annotated consultation map (`/api/map`); if it fails, the report shows the original photograph with local priority pins
- `jspdf` — client-side report PDF
- GoHighLevel — inbound webhook for lead capture, v2 API for PDF upload + report email (`/api/report`)

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in your keys
npm run dev -- -p 3007             # http://127.0.0.1:3007
```

> Don't run `next build` while `next dev` is running — they share the `.next`
> directory and the running dev server will break. Stop dev first.

Leave the GHL credentials unset for local testing to avoid creating real
contacts — the flow completes without them.

## Verification

```bash
npm run test:consultation
npm run build
```

The result contains exactly one highest cosmetic priority, supporting secondary
priorities, and a clinician-review boundary.

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and in
`.env.local` for local dev). See `.env.local.example` for the full template.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Claude vision — the written consultation assessment. |
| `OPENAI_API_KEY` | Yes | `gpt-image-2` — the annotated consultation map. If generation fails, the app falls back to local pins over the photo. |
| `GHL_WEBHOOK_URL` | No | GoHighLevel inbound webhook; leads are POSTed here. If unset, the lead is logged and the user still reaches results. |
| `GHL_API_KEY` / `GHL_API_TOKEN` | No | GHL v2 Private Integration token (either name works) — enables PDF upload, contact custom field and the report email. Skipped if unset. |
| `GHL_LOCATION_ID` | With API token | GHL sub-account (location) id. |
| `GHL_REPORT_FIELD_KEY` | No | Contact custom-field key storing the report URL. Default `facial_report_pdf`. |
| `GHL_REPORT_FIELD_ID` | No | Same field's id (needed to read it back). |
| `GHL_EMAIL_FROM` | No | Verified sender address for the report email; unset uses the location default. |
| `GHL_EMAIL_FROM_NAME` | No | Sender display name. Default "Harley Street Aesthetics". |
| `GHL_BOOKING_URL` | No | Booking CTA in the report email; falls back to `NEXT_PUBLIC_BOOKING_URL`, then the HSA free-online-consultation widget. |
| `GHL_API_BASE` | No | API base override. Default `https://services.leadconnectorhq.com`. |
| `NEXT_PUBLIC_CALENDAR_URL` | No | Booking CTA on the results page; same fallback chain as above. |
| `NEXT_PUBLIC_BOOKING_URL` | No | Shared fallback booking link for page + email CTAs. |
| `NEXT_PUBLIC_META_PIXEL_ID` | No | Meta Pixel for PageView/Lead events + CAPI matching. Set the real HSA pixel before any campaign. |

## Deploying on Vercel

Linked as the Vercel project **`hsa-consultation-map`**.

1. Framework preset: **Next.js** (auto-detected, no config needed).
2. Add the environment variables from the table above.
3. **Deploy.**

## Fork safety

This is one of the five clinic forks of the Veluria-style funnel. Everything
user-facing must read **Harley Street Aesthetics / HSA** — after porting any
file from a sibling fork, re-check names, booking URLs, pixel ids and GHL
credentials before deploying.

---

A cosmetic, non-diagnostic AI assessment. Not medical advice.
