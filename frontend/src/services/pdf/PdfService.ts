import { jsPDF } from "jspdf";
import type { ObservationForPdf, IncludeFlags } from "../../types/observation";

function parseSimpleGeo(lines?: string[]) {
  const out: { lat?: number; lon?: number; alt?: number; source?: string } = {};
  if (!lines || !lines.length) return out;

  // 1) première ligne avec une virgule → "48.85661, 2.35222"
  const latlon = lines.find(l => l.includes(","));
  if (latlon) {
    const [a, b] = latlon.split(",");
    const lat = parseFloat(a.trim());
    const lon = parseFloat(b.trim());
    if (!Number.isNaN(lat)) out.lat = lat;
    if (!Number.isNaN(lon)) out.lon = lon;
  }

  // 2) ligne "source: ..."
  const src = lines.find(l => l.toLowerCase().startsWith("source:"));
  if (src) out.source = src.slice(7).trim();

  // 3) (optionnel) une altitude naïve: on prend le premier nombre suivi de "m"
  const altLine = lines.find(l => l.toLowerCase().includes("m"));
  if (altLine) {
    const num = parseFloat(altLine);
    if (!Number.isNaN(num)) out.alt = num;
  }
  return out;
}

const fmtDeg = (n?: number) => (typeof n === "number" ? n.toFixed(5) : undefined);
const fmtAlt = (n?: number) => (typeof n === "number" ? String(Math.round(n)) : undefined);

function h2(pdf: jsPDF, txt: string, x: number, y: number) {
  pdf.setFont("times", "bold"); pdf.setFontSize(14); pdf.text(txt, x, y);
  return y + 10;
}
function p(pdf: jsPDF, txt: string, x: number, y: number, w: number, fs=12) {
  pdf.setFont("times", "normal"); pdf.setFontSize(fs);
  const wrapped = pdf.splitTextToSize(txt, w);
  pdf.text(wrapped, x, y);
  return y + wrapped.length * 5;
}
function kv(
  pdf: jsPDF,
  label: string,
  value: string | undefined,
  x: number,
  y: number,
  w: number,
  opts?: { gapAfter?: number; labelSize?: number; valueSize?: number; lineH?: number }
) {
  if (!value) return y;

  const gapAfter = opts?.gapAfter ?? 4;     // espace après le bloc
  const labelSize = opts?.labelSize ?? 12;
  const valueSize = opts?.valueSize ?? 12;
  const lineH = opts?.lineH ?? 5;

  // Label (ligne seule)
  pdf.setFont("times", "bold");
  pdf.setFontSize(labelSize);
  pdf.text(`${label} :`, x, y);
  y += lineH;

  // Valeur (en dessous, pleine largeur w)
  pdf.setFont("times", "normal");
  pdf.setFontSize(valueSize);
  const wrapped = pdf.splitTextToSize(value, w);
  pdf.text(wrapped, x, y);

  // Avance le curseur sous le bloc + petit gap
  return y + wrapped.length * lineH + gapAfter;
}

// --- helper: centre-crop + resize en 224x224 ---
async function cropTo224Square(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  const srcW = bmp.width, srcH = bmp.height;
  const side = Math.min(srcW, srcH);                     // carré centré
  const sx = Math.floor((srcW - side) / 2);
  const sy = Math.floor((srcH - side) / 2);

  // canvas intermédiaire pour recadrer au carré
  const tmp = document.createElement("canvas");
  tmp.width = side;
  tmp.height = side;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(bmp, sx, sy, side, side, 0, 0, side, side);
  bmp.close();

  // canvas final 224x224
  const out = document.createElement("canvas");
  out.width = 224;
  out.height = 224;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(tmp, 0, 0, 224, 224);
  return out;
}

export async function generatePdf(
  observation: ObservationForPdf,
  opts?: { include?: IncludeFlags }
): Promise<ArrayBuffer> {
  // flags optionnels (photo & top1 sont obligatoires par design de ta page)
  const include = { top3: true, coords: true, notes: true, ...(opts?.include ?? {}) };

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const margin = 12;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  let y = margin;

  // en-tête
  pdf.setFont("times", "bold");
  pdf.setFontSize(16);
  pdf.text("Litho-SCAN — Rapport d’analyse", margin, y);
  y += 8;

  pdf.setFont("times", "normal");
  pdf.setFontSize(10);
  const d = observation.when ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${pad(d.getFullYear())} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  pdf.text(`Généré le ${ts}`, margin, y);
  y += 6;

  // zone 2 colonnes
  const gap = 8;                              // espace entre colonnes
  const colLeftW = 70;                        // largeur colonne gauche (mm)
  const colRightX = margin + colLeftW + gap;  // x de la colonne droite
  const colRightW = pageW - margin - colRightX;

  // --- Colonne gauche : image 224x224 (affichée en 60x60 mm) ---
  const boxSizeMM = 60;                       // taille affichée (mm)
  const imgCanvas = await cropTo224Square(observation.photo);
  pdf.setDrawColor(230);
  pdf.setLineWidth(0.2);
  // encart
  pdf.rect(margin, y, colLeftW, boxSizeMM + 10);

  // centrer l’image dans l’encart
  const imgX = margin + (colLeftW - boxSizeMM) / 2;
  const imgY = y + 5;
  pdf.addImage(imgCanvas, "JPEG", imgX, imgY, boxSizeMM, boxSizeMM, undefined, "FAST");
  let colBottom = y + boxSizeMM + 10;

  // --- Colonne droite : Top-1 (gros) + alternatives (Top-2/Top-3) ---
  let rx = colRightX;
  let ry = imgY;

  pdf.setFont("times", "bold");
  pdf.setFontSize(16);
  pdf.text("Résultat", rx, ry);
  ry += 5;
  // ligne de séparation sous Résultat
  const yAfterResultat = ry;
  pdf.setLineWidth(0.2);
  pdf.line(rx, yAfterResultat, pageW - margin, yAfterResultat);
  ry += 10;

  // Top-1 (obligatoire)
  const pct01 = `${Math.round(observation.result.top1.percent ?? 0)} %`;
  const top1_label = observation.result.top1.label ?? "—";
  const abst = observation.result.abstained ? " (abstention)" : "";

  pdf.setFont("times", "bold");
  pdf.setFontSize(14);
  pdf.text(`${top1_label + abst} : ${pct01}`, rx, ry);
  ry += 10;

  // Alternatives (Top-2 / Top-3), sans répéter Top-1
  if (include.top3 && (observation.result.alts?.length ?? 0) > 0) {
    const others = (observation.result.alts ?? []).filter(
      (t) => (observation.result.top1.label ?? "") !== (t.label ?? "") && (t.percent ?? 0) > 0
    );
    if (others.length) {
      pdf.setFont("times", "bold");
      pdf.setFontSize(14);
      pdf.text("Alternatives :", rx, ry);
      ry += 8;

      pdf.setFont("times", "normal");
      pdf.setFontSize(12);
      for (const t of others.slice(0, 2)) {
        const p = `${Math.round(t.percent ?? 0)} %`;
        pdf.text(`• ${t.label ?? "—"} : ${p}`, rx, ry);
        ry += 5;
      }
      ry += 2;
    }
  }

  // Couverture / autres classes
  const shownPercents: number[] = [
    Math.max(0, Math.min(100, observation.result.top1.percent ?? 0)),
    ...(include.top3 ? (observation.result.alts ?? []).slice(0, 2).map(a =>
      Math.max(0, Math.min(100, a.percent ?? 0))
    ) : []),
  ];

  const coverage = shownPercents.reduce((s, p) => s + p, 0);
  const remainder = Math.max(0, 100 - coverage);

  if (coverage < 100) {
    pdf.setFont("times", "italic");
    pdf.setFontSize(11);
    const k = shownPercents.length;
    pdf.text(`Couverture Top-${k} : ${coverage} %`, rx, ry); ry += 5;
    pdf.text(`Autres classes : ${remainder} %`, rx, ry);     ry += 6;
    pdf.setFont("times", "normal");
  }

  // ligne de séparation sous la zone 2 colonnes
  const yAfterColumns = Math.max(colBottom, ry) + 6;
  pdf.setLineWidth(0.2);
  pdf.line(margin, yAfterColumns, pageW - margin, yAfterColumns);
  y = yAfterColumns + 4;

  // === BLOC 2 : deux colonnes ===
  // Layout global
  const sectX = margin;
  const sectY = y + 4;
  const sectW = pageW - margin * 2;
  const colGap = 8;
  const leftW  = Math.floor((sectW - colGap) * 0.55); // 55% pour la fiche
  const rightW = sectW - colGap - leftW;
  const leftX  = sectX;
  const rightX = sectX + leftW + colGap;

  // --- Colonne gauche : Fiche Top-1 ---
  let ly = sectY;
  ly = h2(pdf, "Fiche (Top-1)", leftX, ly);

  const rock = observation.top1Rock ?? {};
  // clé/valeurs (on n’écrit que ce qui existe)
  ly = kv(pdf, "Nom", rock.nom, leftX, ly, leftW);
  ly = kv(pdf, "Type", rock.type, leftX, ly, leftW);
  ly = kv(pdf, "Texture", rock.texture, leftX, ly, leftW);
  ly = kv(pdf, "Minéraux principaux", rock.mineraux_principaux, leftX, ly, leftW);
  ly = kv(pdf, "Minéraux secondaires", rock.mineraux_secondaires, leftX, ly, leftW);
  ly = kv(pdf, "Densité (g/cm³)", rock.densite_g_cm3, leftX, ly, leftW);
  ly = kv(pdf, "Dureté (Mohs)", rock.durete_Mohs, leftX, ly, leftW);
  ly = kv(pdf, "Contexte de formation", rock.contexte, leftX, ly, leftW);
  ly = kv(pdf, "Astuces terrain", rock.astuces_terrain, leftX, ly, leftW);

  const leftBottom = ly + 2;

  // --- Colonne droite : Notes (haut) + Coordonnées (bas) ---
  let ry2 = sectY;

  // Notes
  ry2 = h2(pdf, "Notes", rightX, ry2);
  if (observation.notes?.trim()) {
    ry2 = p(pdf, observation.notes.trim(), rightX, ry2, rightW);
  } else {
    pdf.setFont("times","italic"); pdf.setFontSize(10);
    pdf.text("— Aucune note —", rightX, ry2);
    ry2 += 5;
  }

  // fine separator (horizontal) entre Notes et Coordonnées
  ry2 += 4;
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(210);
  pdf.line(rightX, ry2, rightX + rightW, ry2);
  ry2 += 6;

  // Coordonnées
  ry2 = h2(pdf, "Coordonnées", rightX, ry2);

  const lines = observation.geo?.coords ?? [];
  const g = parseSimpleGeo(lines);

  if (g.lat !== undefined || g.lon !== undefined || g.alt !== undefined || g.source) {
    ry2 = kv(pdf, "Latitude (°)",  fmtDeg(g.lat), rightX, ry2, rightW);
    ry2 = kv(pdf, "Longitude (°)", fmtDeg(g.lon), rightX, ry2, rightW);
    ry2 = kv(pdf, "Altitude (m)",  fmtAlt(g.alt), rightX, ry2, rightW);
    ry2 = kv(pdf, "Source",        g.source,      rightX, ry2, rightW);
  } else if (lines.length) {
    // sinon on affiche brut
    pdf.setFont("times","normal"); pdf.setFontSize(11);
    for (const line of lines) { pdf.text(line, rightX, ry2); ry2 += 5; }
  } else {
    pdf.setFont("times","italic"); pdf.setFontSize(10);
    pdf.text("— Non renseignées —", rightX, ry2); ry2 += 5;
  }

  const rightBottom = ry2;

  // encadrement léger des deux colonnes (facultatif)
  pdf.setDrawColor(230); pdf.setLineWidth(0.2);
  pdf.rect(leftX, sectY - 4, leftW, (leftBottom - sectY) + 8);
  pdf.rect(rightX, sectY - 4, rightW, (rightBottom - sectY) + 8);

  // avancer le curseur global y
  y = Math.max(leftBottom, rightBottom) + 12;

  // --- footer inchangé ---
  pdf.setFont("times", "normal"); pdf.setFontSize(9);
  pdf.text(`Litho-SCAN — export local (A4) • © ${pad(d.getFullYear())}`, margin, pageH - margin + 3);

  return pdf.output("arraybuffer");
}