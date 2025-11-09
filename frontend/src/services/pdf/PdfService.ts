import { jsPDF } from "jspdf";

type GeoDisplay = {
  source: "device" | "browser" | "manual";
  coords: string[];
}

type PredictResult = {
  top3: { index: number; label: string; prob: number; percent: number }[];
  top1_label: string | null;
  top1_conf: number;
  abstained: boolean;
};

type ObservationForPdf = {
  photo: Blob;
  result: PredictResult;
  geo?: GeoDisplay;
  notes?: string;
  when?: Date;
};

type IncludeFlags = {
  top1: boolean;
  top3: boolean;
  coords: boolean;
  notes: boolean;
};

export async function generatePdf(
  observation: ObservationForPdf,
  opts?: { include?: IncludeFlags }
): Promise<ArrayBuffer> {

  const include = { top3: true, coords: true, notes: true, ...(opts?.include ?? {}) };
  
  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
  });

  const margin = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = margin;

  // Header
  pdf.setFont("times", "bold");
  pdf.setFontSize(16);
  pdf.text("Litho-SCAN — Rapport d’analyse", margin, y); y += 8;
  
  pdf.setFont("times", "normal"); pdf.setFontSize(10);
  const d = observation.when ?? new Date();
  const pad = (n:number)=>String(n).padStart(2,"0");
  const ts = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  pdf.text(`Généré le ${ts}`, margin, y);
  y += 6;

  // Photo
  if (!(observation.photo instanceof Blob)) {
    throw new Error("PHOTO_MISSING");
  }
  
  const canvas = await blobToCanvas(observation.photo); // cf helper plus bas

  const maxW = pageWidth - margin * 2;
  const maxH = 110;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const drawW = Math.round(canvas.width * ratio);
  const drawH = Math.round(canvas.height * ratio);

  pdf.addImage(
    canvas,
    observation.photo.type === "image/png" ? "PNG" : "JPEG",
    margin, y, drawW, drawH, undefined, "FAST"
  );
  y += drawH + 6;
  pdf.setLineWidth(0.2);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 4;

  //Résultats
  pdf.setFont("times", "bold"); pdf.setFontSize(14);
  pdf.text("Résultat", margin, y); y += 7;
  pdf.setFont("times", "normal"); pdf.setFontSize(12);
  // Top-1
  if (!observation.result.top1_conf) throw new Error("RESULT_MISSING");

  const conf = Math.max(0, Math.min(1, observation.result.top1_conf || 0));
  const pct = (conf * 100).toFixed(1) + " %";
  const top1 = observation.result.top1_label ?? "—";
  const abst = observation.result.abstained ? " (abstention)" : "";
  pdf.text(`Top-1 : ${top1}${abst}`, margin, y);
  pdf.text(`Confiance : ${pct}`, pageWidth - margin - 50, y);
  y += 8;
  // Top-3
  if (include.top3 && (observation.result.top3?.length ?? 0) > 0) {
    pdf.setFontSize(11);
    pdf.text("Top-3 :", margin, y); y += 6;
    pdf.setFont("times", "bold");
    const c1 = margin, c2 = margin + 70, c3 = margin + 120;
    pdf.text("Classe", c1, y);
    pdf.text("Probabilité", c2, y);
    pdf.text("Index", c3, y);
    y += 5; pdf.setLineWidth(0.2); pdf.line(margin, y, pageWidth - margin, y); y += 4;

    pdf.setFont("times", "normal");
    for (const it of observation.result.top3.slice(0, 3)) {
      pdf.text(it.label ?? "—", c1, y);
      const p = (Math.max(0, Math.min(1, it.prob ?? 0)) * 100).toFixed(1) + " %";
      pdf.text(p, c2, y);
      pdf.text(String(it.index ?? "—"), c3, y);
      y += 6;
    }
    y += 2; pdf.setLineWidth(0.2); pdf.line(margin, y, pageWidth - margin, y); y += 5;
  }

  // Coordonnées
  if (include.coords && observation.geo && observation.geo.coords?.length) {
    pdf.setFont("times", "bold"); pdf.setFontSize(13);
    pdf.text("Coordonnées", margin, y); y += 6;
    pdf.setFont("times", "normal"); pdf.setFontSize(11);
    for (const line of observation.geo.coords) { pdf.text(line, margin, y); y += 5; }
    y += 2;
  }

  // Notes
  if (include.notes && observation.notes?.trim()) {
    pdf.setFont("times", "bold"); pdf.setFontSize(13);
    pdf.text("Notes", margin, y); y += 6;
    pdf.setFont("times", "normal"); pdf.setFontSize(11);
    const wrapped = pdf.splitTextToSize(observation.notes.trim(), pageWidth - margin * 2);
    pdf.text(wrapped, margin, y);
    y += 6 + wrapped.length * 5;
  }

  // Footer
  pdf.setFont("times", "normal"); pdf.setFontSize(9);
  pdf.text("Litho-SCAN — export local (A4) • © 2025", margin, pageHeight - margin + 3);
  
  const outputPdf = pdf.output("arraybuffer");
  const sizeKB = Math.round((outputPdf.byteLength / 1024));
  console.log(`PDF size ≈ ${sizeKB} KB`);
  return outputPdf;
}

async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  // chemin 1: createImageBitmap (rapide quand dispo)
  if ("createImageBitmap" in window) {
    const bmp = await createImageBitmap(blob).catch(() => {
      throw new Error("Impossible de décoder l'image.");
    });
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    return c;
  }
  // chemin 2: FileReader → Image → canvas (fallback)
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => im.decode().then(() => res(im)).catch(() => res(im));
    im.onerror = rej;
    im.src = dataUrl;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}
