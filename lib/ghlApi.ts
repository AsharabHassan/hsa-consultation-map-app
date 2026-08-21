/**
 * Thin GoHighLevel (LeadConnector) v2 API client for the report-email feature.
 * All GHL request/response specifics live here so the routes stay clean and any
 * API-shape surprises are fixed in one place.
 */

const BASE = process.env.GHL_API_BASE ?? "https://services.leadconnectorhq.com";
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? "";
// The field KEY is used to WRITE the value (PUT /contacts accepts `key`); the
// field ID is used to READ it back (GET /contacts returns customFields as
// [{id, value}] with no key). The Private Integration token does not have the
// `locations` scope, so the id cannot be resolved via /locations/customFields —
// it is supplied directly via env instead.
const FIELD_KEY = process.env.GHL_REPORT_FIELD_KEY ?? "facial_report_pdf";
const FIELD_ID = process.env.GHL_REPORT_FIELD_ID ?? "";

function token(): string {
  const t = process.env.GHL_API_KEY ?? process.env.GHL_API_TOKEN;
  if (!t) throw new Error("GHL_API_TOKEN is not set");
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
    throw new Error(
      `GHL ${init.method} ${path} → ${res.status}: ${body.slice(0, 300)}`,
    );
  }
  return res;
}

/** Upsert a contact by email; returns the contactId. */
export async function upsertContact(input: {
  email: string;
  name?: string;
}): Promise<string> {
  const [firstName, ...rest] = (input.name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
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

/** Upload a file to the GHL media library; returns the hosted HTTPS URL. */
export async function uploadMedia(
  bytes: Buffer,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    filename,
  );
  form.append("locationId", LOCATION_ID);
  const res = await ghl("/medias/upload-file", {
    method: "POST",
    headers: headers(false), // let fetch set the multipart Content-Type
    body: form,
  });
  const data = (await res.json()) as {
    url?: string;
    fileUrl?: string;
    fileId?: string;
  };
  const url = data.url ?? data.fileUrl;
  if (!url) {
    throw new Error(`GHL media upload returned no url: ${JSON.stringify(data)}`);
  }
  return url;
}

/** Write the report URL onto the contact's custom field (by key). */
export async function setContactReportUrl(
  contactId: string,
  url: string,
): Promise<void> {
  await ghl(`/contacts/${contactId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      customFields: [{ key: FIELD_KEY, field_value: url }],
    }),
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
      customFields?: Array<{ id?: string; value?: string }>;
    };
  };
  const c = data.contact;
  if (!c) throw new Error("GHL getContact returned no contact");
  const fields = c.customFields ?? [];
  // Read back by the configured field id; if unset and there's exactly one
  // custom field, fall back to it.
  const cf =
    (FIELD_ID && fields.find((f) => f.id === FIELD_ID)) ||
    (fields.length === 1 ? fields[0] : undefined);
  return {
    id: c.id,
    email: c.email,
    tags: c.tags ?? [],
    reportUrl: cf?.value,
  };
}

/** Add a tag to a contact (used for send de-dupe). */
export async function addContactTag(
  contactId: string,
  tag: string,
): Promise<void> {
  await ghl(`/contacts/${contactId}/tags`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ tags: [tag] }),
  });
}

/**
 * Send an email to a contact via the Conversations API. The "from" is built as
 * `Display Name <address>` so the recipient sees a friendly sender name. The
 * address comes from GHL_EMAIL_FROM (must be a verified sender in the GHL
 * account) and the name from GHL_EMAIL_FROM_NAME (defaults to "Harley Street
 * Aesthetics"). If no address is set, GHL uses the location's default sender.
 */
export async function sendEmail(input: {
  contactId: string;
  subject: string;
  html: string;
  attachments?: string[];
}): Promise<void> {
  const address = process.env.GHL_EMAIL_FROM;
  const fromName = process.env.GHL_EMAIL_FROM_NAME ?? "Harley Street Aesthetics";
  const from = address
    ? fromName
      ? `${fromName} <${address}>`
      : address
    : undefined;
  await ghl("/conversations/messages", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "Email",
      contactId: input.contactId,
      subject: input.subject,
      html: input.html,
      ...(from ? { emailFrom: from } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    }),
  });
}
