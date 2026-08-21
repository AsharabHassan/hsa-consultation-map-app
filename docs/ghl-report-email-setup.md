# GHL setup — email the skin report (before booking)

When a customer finishes their AI skin analysis, the app:
1. builds their report PDF and uploads it to the GHL media library,
2. stores the file URL on the contact's **Facial Report Pdf** field, and
3. emails the customer their report as a PDF attachment, with a **"Book your
   free consultation"** CTA linking to the booking calendar.

The email is sent **by the app**, *before* booking — it encourages the customer
to book. GHL still handles its own booking-confirmation emails separately, so
there is **no webhook and no workflow to build** for this feature.

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and in
`.env.local` for local dev). Never commit the real token.

| Variable | Value |
| --- | --- |
| `GHL_API_KEY` | The Private Integration token (`pit-…`). |
| `GHL_LOCATION_ID` | `XnwkbaimNt2dfzDG3w4K` |
| `GHL_REPORT_FIELD_KEY` | `facial_report_pdf` |
| `GHL_REPORT_FIELD_ID` | `Glut0DNmtFHMAvhwuHbn` (id of the Facial Report Pdf field) |
| `GHL_BOOKING_URL` | `https://link.drmshaclinic.com/widget/bookings/free-online-phone-consultation` (optional — this is the default) |

The Private Integration token needs scopes: **Contacts** (read + write),
**Medias** (write), and **Conversations / Conversations Messages** (write).

> If the "Facial Report Pdf" custom field is ever recreated, its id changes —
> update `GHL_REPORT_FIELD_ID` to match.

## De-dupe

The email is sent once per contact. After sending, the app adds a
`facial-report-emailed` tag to the contact and skips anyone who already has it.

## How to test

1. Run a real analysis on the live site with a test email you control.
2. In GHL, confirm that contact's **Facial Report Pdf** field is populated with a
   `assets.cdn.filesafe.space/…​.pdf` URL, the contact has the
   `facial-report-emailed` tag, and the report email is in their conversation.
3. Confirm the email arrives with the PDF attached and the booking CTA works.

## What changed from the earlier design

The first version emailed the report **after** booking, triggered by a GHL
"Appointment Booked → Webhook" workflow (which needed a shared `GHL_WEBHOOK_SECRET`).
That is no longer used: the email now goes out **before** booking, sent by the
app when the analysis completes — so the webhook, the workflow, and the secret
are all gone.
