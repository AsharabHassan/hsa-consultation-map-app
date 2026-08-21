"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AnnotatedFace from "./AnnotatedFace";
import type { ConsultationPlanItem, SkinAnalysis } from "@/lib/types";
import { bookingUrl, planSummary, type CtaPlacement } from "@/lib/booking";
import { track, trackServer } from "@/lib/meta";
import { buildAnalysisPdfBase64, downloadAnalysisPdf } from "@/lib/download";

const CALENDAR_URL =
  process.env.NEXT_PUBLIC_CALENDAR_URL ??
  process.env.NEXT_PUBLIC_BOOKING_URL ??
  "https://link.harleystreetaesthetic.co.uk/widget/bookings/aesthetic-consultant-1";

function ConsultationButton({
  href,
  onClick,
  label = "Book your free HSA online consultation",
  compact = false,
}: {
  href: string;
  onClick: () => void;
  label?: string;
  compact?: boolean;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      target="_blank"
      rel="noopener noreferrer"
      className={compact ? "rounded-full bg-plum px-5 py-2 text-xs font-semibold text-white" : "btn-serum"}
    >
      {label}
    </a>
  );
}

function PriorityCard({
  item,
  level,
}: {
  item: ConsultationPlanItem;
  level: "highest" | "medium";
}) {
  const highest = level === "highest";
  return (
    <article
      className={`rounded-[1.6rem] border p-6 shadow-dew sm:p-8 ${
        highest ? "border-plum/20 bg-white/85" : "border-white/70 bg-white/55"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">{highest ? "Primary focus" : "Secondary focus"}</p>
        <span className={`rounded-full px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] ${highest ? "bg-plum text-white" : "bg-[#f1e2bf] text-[#795814]"}`}>
          Visible priority
        </span>
      </div>
      <h3 className="display mt-3 text-3xl text-plum sm:text-4xl">{item.area}</h3>
      <p className="mt-2 text-plum-soft">{item.concern}</p>
      <div className="mt-5 rounded-2xl bg-pearl-deep/70 p-4">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.15em] text-plum-mute">
          Possible consultation direction
        </p>
        <p className="mt-1 text-lg font-semibold text-plum">{item.treatmentRoute}</p>
        <p className="mt-2 text-sm leading-relaxed text-plum-soft">{item.reasoning}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-serum/15 bg-white/70 p-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.15em] text-plum-mute">Possible result direction</p>
          <p className="mt-2 text-sm leading-relaxed text-plum-soft">{item.expectedDirection}</p>
        </div>
        <div className="rounded-2xl border border-serum/15 bg-white/70 p-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.15em] text-plum-mute">Typical discussion</p>
          <p className="mt-2 text-sm leading-relaxed text-plum-soft">{item.typicalJourney}</p>
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-[#f8f0d8] px-4 py-3 text-sm text-[#6f5514]">
        <strong>HSA price guide: </strong>{item.priceGuide}
      </p>
      <p className="mt-4 text-sm text-plum-soft">
        <strong className="text-plum">What the HSA clinician will confirm: </strong>
        {item.consultationObjective}
      </p>
    </article>
  );
}

export default function AnalysisReport({
  before,
  mapImage,
  mapPending,
  analysis,
  email,
  name,
  phone,
  onRestart,
}: {
  before: string;
  mapImage: string | null;
  mapPending: boolean;
  analysis: SkinAnalysis;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  onRestart: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const uploadedKey = useRef("");
  const fired = useRef(new Set<string>());
  const planText = planSummary(analysis.consultationPlan);

  useEffect(() => setMounted(true), []);

  const fire = useCallback(
    (event: string) => {
      if (fired.current.has(event)) return;
      fired.current.add(event);
      const detail = { plan: planText, focus: analysis.consultationPlan.highPriority.area };
      track(event, detail);
      trackServer(email, event, detail);
    },
    [analysis.consultationPlan.highPriority.area, email, planText],
  );

  useEffect(() => fire("ConsultationMapViewed"), [fire]);

  const ctaHref = (placement: CtaPlacement) =>
    bookingUrl(CALENDAR_URL, {
      plan: analysis.consultationPlan,
      name,
      email,
      phone,
      placement,
    });

  const onBookingClick = (placement: CtaPlacement) => () => {
    const detail = {
      plan: planText,
      focus: analysis.consultationPlan.highPriority.area,
      placement,
    };
    track("Schedule", detail, true);
    trackServer(email, "BookingClicked", detail);
  };

  useEffect(() => {
    if (!email || !before || mapPending) return;
    const key = `${email}|${mapImage ? "generated" : "fallback"}`;
    if (uploadedKey.current === key) return;
    uploadedKey.current = key;
    let cancelled = false;
    (async () => {
      try {
        const pdfBase64 = await buildAnalysisPdfBase64({ analysis, before, map: mapImage });
        if (cancelled) return;
        await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, pdfBase64, sendEmail: true }),
        });
      } catch {
        // Report delivery is best effort and must never block the consultation map.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analysis, before, email, mapImage, mapPending, name]);

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      await downloadAnalysisPdf({ analysis, before, map: mapImage });
    } catch {
      alert("Sorry — the report could not be created on this device.");
    } finally {
      setPdfBusy(false);
    }
  };

  const high = analysis.consultationPlan.highPriority;
  const medium = analysis.consultationPlan.mediumPriorities;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 pb-24">
      <header className="text-center animate-fade-scale">
        <p className="eyebrow">Your HSA facial map</p>
        <h2 className="display mt-4 text-4xl text-plum sm:text-6xl">
          Focus on what matters <span className="serum-text italic">most.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-balance leading-relaxed text-plum-soft">
          {analysis.summary}
        </p>
      </header>

      <div className="rounded-2xl border border-amber-300/70 bg-amber-50/80 p-4 text-sm leading-relaxed text-amber-900">
        <strong>Important: </strong>{analysis.disclaimer}
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="How this report was created">
        {[
          ["Doctor-trained AI", "Informed by thousands of aesthetic concern patterns and applied to your photograph."],
          ["HSA-restricted", "Only defined HSA consultation pathways can be suggested."],
          ["Clinician-led next step", "Suitability and the final plan are confirmed in consultation."],
        ].map(([title, copy]) => (
          <div key={title} className="rounded-2xl border border-plum/15 bg-white/65 p-4 text-center">
            <p className="text-sm font-semibold text-plum">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-plum-soft">{copy}</p>
          </div>
        ))}
      </section>

      <section className="glass-soft p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">Visible snapshot</p>
            <h3 className="display mt-2 text-3xl text-plum">Full-face snapshot, focused plan</h3>
          </div>
          <p className="text-xs text-plum-mute">Higher score = less visible room for improvement</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {analysis.categories.map((category) => (
            <div key={category.label} className="rounded-2xl bg-white/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-plum">{category.label}</p>
                <span className="font-display text-2xl text-serum">{category.score}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9e1d1]">
                <div className="h-full rounded-full bg-serum" style={{ width: `${category.score}%` }} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-plum-soft">{category.note}</p>
            </div>
          ))}
        </div>
      </section>

      <PriorityCard item={high} level="highest" />

      <div className="flex flex-col items-center gap-3 text-center">
        <ConsultationButton href={ctaHref("priority")} onClick={onBookingClick("priority")} />
        <p className="text-xs text-plum-mute">Free · Online · No obligation</p>
      </div>

      <section>
        <p className="eyebrow">Your visual map</p>
        <h3 className="display mt-2 text-3xl text-plum sm:text-4xl">Everything visible, clearly mapped</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-plum-soft">
          The map records all clearly supported visible observations. The primary and up to
          three secondary focuses become treatment discussions, keeping your consultation useful and
          concise; focus describes relevance, not medical urgency.
        </p>
        <div className="mt-6">
          <AnnotatedFace
            image={before}
            annotations={analysis.annotations}
            mapImage={mapImage}
            mapPending={mapPending}
            onOpen={setLightbox}
          />
        </div>
        <div className="mt-6 text-center">
          <ConsultationButton
            href={ctaHref("map")}
            onClick={onBookingClick("map")}
            label="Ask HSA about my map"
          />
        </div>
      </section>

      {medium.length > 0 && (
        <section>
          <p className="eyebrow">Your secondary focuses</p>
          <h3 className="display mt-2 text-3xl text-plum sm:text-4xl">Other visible areas worth discussing</h3>
          <div className="mt-6 grid gap-5">
            {medium.map((item) => (
              <PriorityCard key={`${item.area}-${item.treatmentRoute}`} item={item} level="medium" />
            ))}
          </div>
        </section>
      )}

      {analysis.clinicianReview.length > 0 && (
        <section className="rounded-[1.6rem] border border-slate-300/70 bg-slate-50/80 p-6 sm:p-8">
          <p className="eyebrow">For clinician review</p>
          <h3 className="display mt-2 text-3xl text-plum">What the photograph cannot determine</h3>
          <p className="mt-2 text-sm leading-relaxed text-plum-soft">
            These visible features are not diagnosed or assigned a cosmetic treatment by the AI.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-plum-soft">
            {analysis.clinicianReview.map((item) => (
              <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass p-7 text-center sm:p-10">
        <p className="eyebrow">Your next step</p>
        <h3 className="display mt-3 text-3xl text-plum sm:text-4xl">Turn the map into a plan with HSA</h3>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-plum-soft">
          An HSA clinician will confirm what is causing the concern, whether treatment is
          appropriate, and how to build a safe plan around your goals and medical history.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <ConsultationButton href={ctaHref("footer")} onClick={onBookingClick("footer")} />
          <button type="button" onClick={downloadPdf} disabled={pdfBusy} className="btn-ghost">
            {pdfBusy ? "Preparing report…" : "Download consultation map PDF"}
          </button>
          <button type="button" onClick={onRestart} className="text-sm text-plum-mute underline-offset-4 hover:underline">
            Start a new assessment
          </button>
        </div>
      </section>

      <div className="safe-fixed-bottom no-print fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/70 bg-white/90 px-4 py-2.5 shadow-dew backdrop-blur-xl">
          <span className="hidden text-sm font-medium text-plum sm:inline">Review your primary focus</span>
          <ConsultationButton
            href={ctaHref("sticky")}
            onClick={onBookingClick("sticky")}
            compact
            label="Book free consultation"
          />
        </div>
      </div>

      {mounted && lightbox && createPortal(
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          aria-label="Close enlarged consultation map"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Enlarged consultation map" className="max-h-full max-w-full rounded-2xl object-contain" />
        </button>,
        document.body,
      )}
    </div>
  );
}
