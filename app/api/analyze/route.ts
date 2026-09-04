import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  CONSULTATION_ANALYSIS_SYSTEM_PROMPT,
  consultationUserPrompt,
} from "@/lib/consultationPrompt";
import { normaliseConsultationAnalysis } from "@/lib/consultation";
import {
  attachSecondOpinions,
  fetchLocalClassifierPrediction,
} from "@/lib/localClassifier";
import {
  classifierModeFrom,
  leadPromptBlock,
  reconcileLeadAnalysis,
  selectLeadRegions,
} from "@/lib/classifierLead";
import type { SkinAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-5";
const TRANSIENT_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function parseDataUrl(dataUrl: unknown): { mediaType: ImageMediaType; data: string } | null {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) return null;
  return { mediaType: match[1] as ImageMediaType, data: match[2] };
}

function transientStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && TRANSIENT_STATUSES.has(status) ? status : null;
}

function extractJson(text: string): SkinAnalysis | { error: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Analysis is not configured." }, { status: 500 });
  }

  let body: { image?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const image = parseDataUrl(body.image);
  if (!image) {
    return NextResponse.json({ error: "A valid image is required." }, { status: 400 });
  }
  const client = new Anthropic({ apiKey });

  // Clinic classifier (off unless LOCAL_CLASSIFIER_URL is set).
  //   observe: the analysis is unchanged; agreement is reported alongside it.
  //   lead:    the classifier picks the regions and the vision model may only
  //            describe those. Falls back to model-led whenever the classifier
  //            is unavailable or flags nothing, so an outage is never visible.
  const classifierMode = classifierModeFrom(process.env.CLASSIFIER_MODE);
  const classifierPromise =
    classifierMode === "off"
      ? Promise.resolve(null)
      : fetchLocalClassifierPrediction(image, {
          url: process.env.LOCAL_CLASSIFIER_URL,
          secret: process.env.LOCAL_CLASSIFIER_SECRET,
        });

  const leadRegions =
    classifierMode === "lead" ? selectLeadRegions(await classifierPromise) : [];
  const leadBlock = leadRegions.length ? `\n\n${leadPromptBlock(leadRegions)}` : "";

  const callModel = async (nudge?: string) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await client.messages.create({
          model: MODEL,
          max_tokens: 5000,
          thinking: { type: "disabled" },
          system: CONSULTATION_ANALYSIS_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mediaType,
                    data: image.data,
                  },
                },
                {
                  type: "text",
                  text: `${nudge ?? consultationUserPrompt()}${leadBlock}`,
                },
              ],
            },
          ],
        });
      } catch (error) {
        const status = transientStatus(error);
        if (!status || attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 900 * 2 ** attempt));
      }
    }
  };

  try {
    let message = await callModel();
    let text = message.content.find((block) => block.type === "text")?.text?.trim() ?? "";
    let parsed = extractJson(text);
    if (!parsed) {
      message = await callModel(
        "Return the same HSA consultation assessment again as one complete valid JSON object only. Map every clearly supported distinct visible observation with no more than seven annotations, and keep mediumPriorities to at most three distinct areas. Never mention EndoLift.",
      );
      text = message.content.find((block) => block.type === "text")?.text?.trim() ?? "";
      parsed = extractJson(text);
    }
    if (!parsed) {
      return NextResponse.json(
        { error: "We couldn't analyse that photograph. Please try another." },
        { status: 422 },
      );
    }
    if ("error" in parsed) {
      return NextResponse.json(
        { error: "We couldn't detect a clear face. Please upload a well-lit, front-facing photo." },
        { status: 422 },
      );
    }
    // Lead mode filters the RAW model JSON down to the flagged regions. What
    // survives still goes through normaliseConsultationAnalysis, so every
    // treatment shown is one treatmentRouteFor() chose from HSA's agreed
    // routes — the classifier can never introduce one.
    const leadOutcome = leadRegions.length
      ? reconcileLeadAnalysis(parsed as unknown as Record<string, unknown>, leadRegions)
      : null;
    const effective = (leadOutcome?.raw ?? parsed) as unknown as SkinAnalysis;

    const { analysis, summary: classifier } = attachSecondOpinions(
      normaliseConsultationAnalysis(effective),
      await classifierPromise,
    );

    if (classifier) {
      console.info(
        `[analyze] classifier ${classifier.modelVersion} mode=${classifierMode} agreed=${classifier.agreed} disagreed=${classifier.disagreed} unmapped=${classifier.unmappedAreas}`,
      );
    }

    return NextResponse.json({
      analysis,
      ...(classifier ? { classifier } : {}),
      ...(leadOutcome
        ? {
            lead:
              leadOutcome.mode === "lead"
                ? {
                    mode: "lead" as const,
                    regions: leadOutcome.regions.map((r) => r.label),
                    vetoed: leadOutcome.vetoed,
                    dropped: leadOutcome.dropped,
                    omitted: leadOutcome.omitted,
                  }
                : { mode: "fallback" as const, reason: leadOutcome.reason },
          }
        : {}),
    });
  } catch (error) {
    console.error("[analyze] failed:", error);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 502 });
  }
}
