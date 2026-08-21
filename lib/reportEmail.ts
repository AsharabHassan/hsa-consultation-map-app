import { DISCLAIMER_FULL } from "./legal";

const CALENDAR_URL =
  process.env.GHL_BOOKING_URL ??
  process.env.NEXT_PUBLIC_BOOKING_URL ??
  "https://link.harleystreetaesthetic.co.uk/widget/bookings/aesthetic-consultant-1";

export function reportEmail(firstName: string): { subject: string; html: string } {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  return {
    subject: firstName
      ? `Your consultation map is ready, ${firstName}`
      : "Your consultation map is ready",
    html: `
<div style="font-family:Helvetica,Arial,sans-serif;color:#2b2b2b;line-height:1.6;font-size:15px">
  <p>${greeting}</p>
  <p>Thank you for completing your complimentary visual skin assessment with
  <strong>Harley Street Aesthetics</strong>. Your personalised facial concern and
  technology map is attached as a PDF. Our doctor-trained AI, informed by thousands
  of aesthetic concern patterns, records the clearly visible observations across the
  face and focuses the consultation on one primary and up to three secondary areas.</p>
  <p>The best next step is a <strong>free, no-obligation online consultation</strong>,
  where an HSA clinician can review the concern, your medical history and your goals before
  confirming whether any treatment is suitable.</p>
  <p style="margin:26px 0">
    <a href="${CALENDAR_URL}" target="_blank"
       style="display:inline-block;padding:14px 34px;background:#212121;color:#ffffff;
              font-weight:bold;font-size:14px;letter-spacing:0.5px;border-radius:999px;
              text-decoration:none">Book your free consultation &rarr;</a>
    <br/><span style="font-size:12px;color:#9e9e9e">Online &middot; No obligation</span>
  </p>
  <p style="font-size:12px;color:#8a6d3b;background:#fcf6e8;border:1px solid #e6cf8f;border-radius:8px;padding:10px 12px">
    ${DISCLAIMER_FULL}
  </p>
  <p>We look forward to speaking with you.<br/>&mdash; Harley Street Aesthetics</p>
</div>`.trim(),
  };
}
