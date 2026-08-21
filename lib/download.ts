import type { ConsultationPlanItem, SkinAnalysis } from "./types";
import { loadImage } from "./canvas";

async function toJpegDataUrl(src: string, quality = 0.84): Promise<string> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return src;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

export interface PdfOpts {
  analysis: SkinAnalysis;
  before: string;
  map: string | null;
}

async function buildAnalysisPdfDoc({ analysis, before, map }: PdfOpts) {
  const visual = await toJpegDataUrl(map ?? before);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensure = (height: number) => {
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const heading = (text: string, size = 14) => {
    ensure(size + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(50, 34, 67);
    doc.text(text, margin, y);
    y += size + 7;
  };
  const body = (text: string, size = 10, color: [number, number, number] = [82, 72, 88]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    ensure(lines.length * (size + 3));
    doc.text(lines, margin, y);
    y += lines.length * (size + 3) + 8;
  };
  const planCard = (item: ConsultationPlanItem, label: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const concernLines = doc.splitTextToSize(item.concern, contentWidth - 24) as string[];
    const reasoningLines = doc.splitTextToSize(item.reasoning, contentWidth - 24) as string[];
    const routeLines = doc.splitTextToSize(
      `Possible direction: ${item.treatmentRoute}`,
      contentWidth - 24,
    ) as string[];
    const expectedLines = doc.splitTextToSize(
      `Possible result direction: ${item.expectedDirection}`,
      contentWidth - 24,
    ) as string[];
    const journeyLines = doc.splitTextToSize(
      `Typical discussion: ${item.typicalJourney}`,
      contentWidth - 24,
    ) as string[];
    const priceLines = doc.splitTextToSize(
      `HSA price guide: ${item.priceGuide}`,
      contentWidth - 24,
    ) as string[];
    const objectiveLines = doc.splitTextToSize(
      `The HSA clinician will confirm: ${item.consultationObjective}`,
      contentWidth - 24,
    ) as string[];
    const height =
      98 +
      (concernLines.length +
        routeLines.length +
        reasoningLines.length +
        expectedLines.length +
        journeyLines.length +
        priceLines.length +
        objectiveLines.length) *
        10;
    ensure(height + 10);
    doc.setFillColor(label === "PRIMARY FOCUS" ? 249 : 252, 248, 244);
    doc.setDrawColor(label === "PRIMARY FOCUS" ? 114 : 202, label === "PRIMARY FOCUS" ? 68 : 151, label === "PRIMARY FOCUS" ? 104 : 55);
    doc.roundedRect(margin, y, contentWidth, height, 8, 8, "FD");
    let cardY = y + 17;
    doc.setTextColor(125, 82, 114);
    doc.text(label, margin + 12, cardY);
    cardY += 18;
    doc.setFontSize(14);
    doc.setTextColor(50, 34, 67);
    doc.text(item.area, margin + 12, cardY);
    cardY += 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(82, 72, 88);
    doc.text(concernLines, margin + 12, cardY);
    cardY += concernLines.length * 10 + 10;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(58, 122, 128);
    doc.text(routeLines, margin + 12, cardY);
    cardY += routeLines.length * 10 + 3;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(82, 72, 88);
    doc.text(reasoningLines, margin + 12, cardY);
    cardY += reasoningLines.length * 10 + 6;
    doc.text(expectedLines, margin + 12, cardY);
    cardY += expectedLines.length * 10 + 6;
    doc.text(journeyLines, margin + 12, cardY);
    cardY += journeyLines.length * 10 + 6;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(142, 104, 18);
    doc.text(priceLines, margin + 12, cardY);
    cardY += priceLines.length * 10 + 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(82, 72, 88);
    doc.text(objectiveLines, margin + 12, cardY);
    y += height + 12;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(40, 37, 38);
  doc.text("HARLEY STREET AESTHETICS", margin, y);
  y += 17;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(107, 159, 164);
  doc.text("Facial concern & technology map", margin, y);
  y += 26;

  heading("Your consultation summary", 18);
  body(analysis.summary, 11);

  heading("Full-face visible snapshot");
  analysis.categories.forEach((category) =>
    body(`${category.label}: ${category.score}/100 — ${category.note}`, 9),
  );

  planCard(analysis.consultationPlan.highPriority, "PRIMARY FOCUS");

  heading("Your visual consultation map");
  const size = Math.min(contentWidth, 330);
  ensure(size + 14);
  doc.addImage(visual, "JPEG", margin, y, size, size);
  y += size + 16;
  body(
    map
      ? "The GPT visual map uses the exact Sonnet findings to show one primary and up to three secondary consultation priorities. Priority describes relevance, not medical urgency."
      : "The generated overlay was unavailable, so this report contains the original assessment photograph. The written priorities remain unchanged.",
    9,
  );

  if (analysis.consultationPlan.mediumPriorities.length) {
    heading("Secondary focuses");
    analysis.consultationPlan.mediumPriorities.forEach((item) =>
      planCard(item, "SECONDARY FOCUS"),
    );
  }

  if (analysis.clinicianReview.length) {
    heading("For clinician review");
    analysis.clinicianReview.forEach((item) => body(`• ${item}`, 9));
  }

  heading("Important");
  body(analysis.disclaimer, 9, [112, 78, 30]);
  body(
    "Book your free online consultation with Harley Street Aesthetics to confirm the concern, suitability and safest personalised plan.",
    10,
  );

  return doc;
}

export async function downloadAnalysisPdf(options: PdfOpts): Promise<void> {
  const doc = await buildAnalysisPdfDoc(options);
  try {
    doc.save("HSA-Facial-Consultation-Map.pdf");
  } catch {
    window.open(doc.output("bloburl"), "_blank");
  }
}

export async function buildAnalysisPdfBase64(options: PdfOpts): Promise<string> {
  const doc = await buildAnalysisPdfDoc(options);
  return doc.output("datauristring").split(",")[1] ?? "";
}
