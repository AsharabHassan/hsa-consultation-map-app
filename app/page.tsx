"use client";

import { useState } from "react";
import SelfieCapture from "@/components/SelfieCapture";
import LeadForm from "@/components/LeadForm";
import Processing from "@/components/Processing";
import AnalysisReport from "@/components/AnalysisReport";
import type { LeadPayload, SkinAnalysis } from "@/lib/types";
import type { GhlMeta } from "@/lib/ghl";
import { DISCLAIMER_SHORT } from "@/lib/legal";

type Step = "welcome" | "capture" | "form" | "processing" | "result" | "error";

async function analyseSkinPhoto(image: string): Promise<SkinAnalysis> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.analysis) {
    throw new Error(data.error ?? "We couldn't complete your consultation map.");
  }
  return data.analysis as SkinAnalysis;
}

export default function Home() {
  const [step, setStep] = useState<Step>("welcome");
  const [selfie, setSelfie] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadPayload | null>(null);
  const [leadMeta, setLeadMeta] = useState<GhlMeta | null>(null);
  const [analysis, setAnalysis] = useState<SkinAnalysis | null>(null);
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [mapPending, setMapPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const reset = () => {
    setStep("welcome");
    setSelfie(null);
    setLead(null);
    setLeadMeta(null);
    setAnalysis(null);
    setMapImage(null);
    setMapPending(false);
    setErrorMsg("");
  };

  const runAnalysis = async (
    image: string,
    leadData: LeadPayload,
    metaData: GhlMeta,
  ) => {
    setStep("processing");
    setMapImage(null);
    setMapPending(true);
    try {
      const result = await analyseSkinPhoto(image);
      setAnalysis(result);
      setStep("result");

      fetch("/api/lead/concerns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...leadData, analysis: result, meta: metaData }),
      }).catch(() => {});

      fetch("/api/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          areas: result.annotations.map((annotation) => ({
            area: annotation.area,
            concern: annotation.concern,
            priority: annotation.priority,
            treatment: annotation.treatment,
          })),
        }),
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          return response.ok ? (data.image as string) : null;
        })
        .catch(() => null)
        .then((generatedMap) => {
          if (generatedMap) setMapImage(generatedMap);
          setMapPending(false);
        });
    } catch (error) {
      setMapPending(false);
      setErrorMsg(error instanceof Error ? error.message : "We couldn't complete your analysis.");
      setStep("error");
    }
  };

  return (
    <main className="relative min-h-dvh">
      <header className="relative z-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-1 px-6 pt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hsa-logo.png"
            alt="Harley Street Aesthetics"
            className="h-16 w-auto object-contain"
            draggable={false}
          />
          <p className="text-[0.6rem] uppercase tracking-couture text-plum-mute">
            Doctor-led facial concern map
          </p>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 py-12 sm:py-16">
        {step === "welcome" && (
          <section className="relative mx-auto max-w-2xl text-center">
            <p className="eyebrow animate-fade-scale">Complimentary AI skin assessment</p>
            <h1 className="display mt-6 animate-fade-scale text-5xl text-plum sm:text-7xl">
              Your HSA facial
              <br />
              <span className="serum-text italic">technology map.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-lg animate-fade-scale text-balance text-plum-soft">
              One photograph independently maps all clearly visible facial concerns. It then
              focuses your consultation on the most relevant priority and, where useful, one
              up to three secondary areas—without asking you to decide what the AI should find.
            </p>
            <div className="mt-10 flex animate-fade-scale flex-col items-center gap-4">
              <button onClick={() => setStep("capture")} className="btn-serum">
                Create my HSA map
              </button>
              <p className="text-[0.7rem] uppercase tracking-[0.16em] text-plum-mute">
                Processed privately · Photograph never stored
              </p>
              <div className="mx-auto mt-2 max-w-md rounded-2xl border border-plum/20 bg-white/60 px-4 py-3">
                <p className="text-xs font-medium leading-relaxed text-plum-soft">
                  <span className="font-semibold text-plum">Please note: </span>
                  {DISCLAIMER_SHORT} An HSA clinician confirms suitability during consultation.
                </p>
              </div>
            </div>

            <div className="mx-auto mt-14 grid max-w-xl grid-cols-3 gap-3">
              {[
                ["01", "Observe"],
                ["02", "Match technology"],
                ["03", "Book consultation"],
              ].map(([number, label]) => (
                <div key={number} className="glass-soft px-3 py-5 text-center">
                  <p className="font-display text-2xl text-plum-mute">{number}</p>
                  <p className="mt-1 text-[0.62rem] uppercase tracking-[0.12em] text-plum-soft">
                    {label}
                  </p>
                </div>
              ))}
            </div>

            <div className="glass-soft mx-auto mt-10 max-w-xl p-6 text-left">
              <p className="eyebrow">The HSA portfolio approach</p>
              <h2 className="display mt-2 text-3xl text-plum">A complete map. A focused consultation.</h2>
              <p className="mt-3 text-sm leading-relaxed text-plum-soft">
                The AI reviews the full visible face, while the treatment plan stays concise:
                one primary and up to three secondary consultation directions. The clinician
                decides what is appropriate after medical and in-person assessment.
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-2xl text-left">
              <p className="eyebrow text-center">Why you can trust the process</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["Doctor-trained AI", "Informed by thousands of aesthetic concern patterns and applied independently to your photograph."],
                  ["HSA-constrained logic", "Recommendations are restricted to HSA’s defined consultation pathways and visible evidence."],
                  ["Clinician confirmed", "The map supports a conversation; an HSA clinician confirms cause, suitability and treatment."],
                ].map(([title, copy]) => (
                  <article key={title} className="rounded-2xl border border-plum/15 bg-white/70 p-4 text-center">
                    <h3 className="text-sm font-semibold text-plum">{title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-plum-soft">{copy}</p>
                  </article>
                ))}
              </div>
              <p className="mt-4 text-center text-xs leading-relaxed text-plum-mute">
                AI-supported visual assessment · Cosmetic and non-diagnostic · Every result is generated from the submitted photograph
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-2xl text-left">
              <p className="eyebrow text-center">What your map can explore</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["Under-eyes", "Polynucleotides, fractional CO2 eye care or structural filler assessment—depending on what is visibly driving the shadow."],
                  ["Texture & scarring", "Virtue RF microneedling or fractional CO2 resurfacing, chosen according to the visible surface pattern and skin assessment."],
                  ["Lift & definition", "PLACL thread lifting, HIFU or dermal filler contouring—matched to tissue descent, laxity or structural volume."],
                  ["Tone & skin quality", "Q-switch laser with mesotherapy, Veluria skin boosting or regenerative PRP discussion where appropriate."],
                ].map(([title, copy]) => (
                  <article key={title} className="rounded-2xl border border-serum/15 bg-white/65 p-4">
                    <h3 className="font-semibold text-plum">{title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-plum-soft">{copy}</p>
                  </article>
                ))}
              </div>
              <p className="mt-4 text-center text-xs leading-relaxed text-plum-mute">
                These are consultation directions, not diagnoses or confirmed prescriptions. Results and suitability vary.
              </p>
            </div>
          </section>
        )}

        {step === "capture" && (
          <section className="w-full animate-fade-scale">
            <div className="mb-8 text-center">
              <p className="eyebrow">Step 01 — Your photograph</p>
              <h2 className="display mt-3 text-4xl text-plum sm:text-5xl">Let&apos;s find your clearest priorities</h2>
            </div>
            <SelfieCapture
              onCaptured={(image) => {
                setSelfie(image);
                setStep("form");
              }}
            />
          </section>
        )}

        {step === "form" && selfie && (
          <section className="w-full animate-fade-scale">
            <LeadForm
              selfie={selfie}
              onSubmitted={(submittedLead, submittedMeta) => {
                setLead(submittedLead);
                setLeadMeta(submittedMeta);
                runAnalysis(selfie, submittedLead, submittedMeta);
              }}
            />
          </section>
        )}

        {step === "processing" && <Processing />}

        {step === "result" && analysis && selfie && (
          <AnalysisReport
            before={selfie}
            mapImage={mapImage}
            mapPending={mapPending}
            analysis={analysis}
            email={lead?.email ?? null}
            name={lead?.name ?? null}
            phone={lead?.phone ?? null}
            onRestart={reset}
          />
        )}

        {step === "error" && (
          <section className="mx-auto max-w-md animate-fade-scale text-center">
            <p className="eyebrow">Something interrupted us</p>
            <h2 className="display mt-3 text-4xl text-plum">Let&apos;s try that again</h2>
            <p className="mt-3 text-plum-soft">{errorMsg}</p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <button
                onClick={() => selfie && lead && leadMeta && runAnalysis(selfie, lead, leadMeta)}
                className="btn-serum"
              >
                Retry
              </button>
              <button onClick={reset} className="text-sm text-plum-mute underline-offset-4 hover:text-plum hover:underline">
                Start over
              </button>
            </div>
          </section>
        )}
      </div>

      <footer className={`relative z-10 mx-auto max-w-5xl px-6 text-center text-[0.65rem] uppercase tracking-[0.14em] text-plum-mute/70 ${step === "result" ? "pb-24" : "pb-10"}`}>
        © {new Date().getFullYear()} Harley Street Aesthetics · Cosmetic,
        non-diagnostic visual assessment · Not medical advice
      </footer>
    </main>
  );
}
