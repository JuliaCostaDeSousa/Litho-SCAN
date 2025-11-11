import { jsPDF } from "jspdf";
import type { ObservationForPdf, IncludeFlags } from "../../types/observation";

function titleWithRule(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  opts?: {
    fontSize?: number;
    align?: "left" | "center" | "right";
    containerW?: number;      // largeur utile du bloc (mm)
    ruleMode?: "full" | "margin" | "text" | "none";

    // pour ruleMode:"margin"
    ruleMargin?: number;      // marge latérale en mm (par défaut 4)

    // pour ruleMode:"text"
    textScale?: number;       // proportion de la largeur du titre (par défaut 0.8)
    ruleMin?: number;         // borne min (mm) (par défaut 18)
    ruleMax?: number;         // borne max (mm) (par défaut 48)

    // communs
    ruleOffsetY?: number;     // distance sous le titre (mm)
  }
) {
  const fs = opts?.fontSize ?? 14;
  const align = opts?.align ?? "left";
  const containerW = opts?.containerW ?? 0;
  const mode = opts?.ruleMode ?? "text";
  const ruleOffsetY = opts?.ruleOffsetY ?? 3;

  pdf.setFont("times", "bold");
  pdf.setFontSize(fs);

  // Position du titre
  const tw = pdf.getTextWidth(text); // déjà à la taille courante
  let tx = x;
  if (align === "center" && containerW > 0) tx = x + (containerW - tw) / 2;
  if (align === "right"  && containerW > 0) tx = x + (containerW - tw);
  const snap = (v: number) => Math.round(v * 100) / 100;

  pdf.text(text, snap(tx), y);

  // Si pas de ligne : terminé
  if (mode === "none") return y + 10;

  // Calcul largeur (rw) et position (rx) de la ligne
  let rw = 0;
  let rx = x;

  if (mode === "full") {
    // Toute la largeur du conteneur
    const usableW = containerW > 0 ? containerW : 0;
    rw = usableW;
    if (align === "center" && containerW > 0) rx = x;
    else if (align === "right" && containerW > 0) rx = x;
    else rx = x;
  } else if (mode === "margin") {
    // Pleine largeur - marge de chaque côté
    const m = opts?.ruleMargin ?? 4;
    const usableW = Math.max(0, (containerW > 0 ? containerW : 0) - 2 * m);
    rw = usableW;
    rx = x + m;
  } else if (mode === "text") {
    // Proportionnelle au texte + bornes
    const scale = opts?.textScale ?? 0.8;
    const rmin = opts?.ruleMin ?? 1;
    const rmax = opts?.ruleMax ?? 48;
    rw = Math.max(rmin, Math.min(rmax, tw * scale));

    // Ancrer sous le texte (et pas au conteneur)
    if (align === "center") rx = tx + (tw - rw) / 2;
    else if (align === "right") rx = tx + (tw - rw);
    else rx = tx;
  }

  pdf.setDrawColor(210);
  pdf.setLineWidth(0.3);
  pdf.line(snap(rx), snap(y + ruleOffsetY), snap(rx + rw), snap(y + ruleOffsetY));

  return y + 10;
}


function writeWithin(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  w: number,
  maxH: number,
  fs = 12,
  font: { family: "times" | "helvetica" | "courier"; style: "normal" | "bold" | "italic" } = { family: "times", style: "normal" },
  lineH = 5
) {
  pdf.setFont(font.family, font.style);
  pdf.setFontSize(fs);
  const lines = pdf.splitTextToSize(text, w) as string[];
  const maxLines = Math.floor(maxH / lineH);
  const clipped = lines.slice(0, Math.max(0, maxLines));
  if (clipped.length) pdf.text(clipped, x, y);
  const usedH = Math.min(lines.length, maxLines) * lineH;
  const truncated = lines.length > maxLines;
  return { nextY: y + usedH, truncated };
}


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


  // === Rangée haute collée : cadre unique + séparateur vertical ===
  const gap = 0;                              // espace entre colonnes
  const colLeftW = 70;                        // largeur colonne gauche (mm)
  const colRightX = margin + colLeftW + gap;  // x de la colonne droite
  const colRightW = pageW - margin - colRightX;
  const topX = margin;
  const topY = y;
  const topW = colLeftW + colRightW;      // gap=0, largeur totale
  const boxSizeMM = 60;                       // taille affichée (mm) photo
  const topH = boxSizeMM + 10;
  const topPad = 4;

  pdf.setDrawColor(230); pdf.setLineWidth(0.2);
  pdf.rect(topX, topY, topW, topH);

  // séparateur vertical à la jonction
  const divX = margin + colLeftW;
  pdf.setDrawColor(210); pdf.setLineWidth(0.3);
  pdf.line(divX, topY, divX, topY + topH);


  // --- Colonne gauche : image 224x224 (affichée en 60x60 mm) ---
  const imgCanvas = await cropTo224Square(observation.photo);

  // centrer l’image dans l’encart
  // moitié gauche (photo)
  const leftBoxX = margin;
  const leftBoxW = colLeftW;
  const imgX = leftBoxX + (leftBoxW - boxSizeMM) / 2;
  const imgY = topY + (topH - boxSizeMM) / 2;
  pdf.addImage(imgCanvas, "JPEG", imgX, imgY, boxSizeMM, boxSizeMM, undefined, "FAST");
  let colBottom = y + boxSizeMM + 10;
  colBottom = Math.max(colBottom, topY + topH);

    // --- Bloc Résultats (colonne droite, autonome) ---
  const rightBlockY = y;                        // même top que la photo
  const rightBlockH = boxSizeMM + 10;           // même hauteur que l'encart photo pour la symétrie

  // Zone intérieure
  // moitié droite (résultats)
  let rx = divX + topPad;
  let ry = topY + topPad + 2;
  const rInnerW = colRightW - 2 * topPad;

  ry = titleWithRule(pdf, "Résultats", rx, ry, {
    align: "left",
    containerW: rInnerW,
    ruleMode: "text", textScale: 1, ruleMax: 48, ruleOffsetY: 3
  });
  ry += 2;

  // === Tableau des prédictions (2 lignes × [1 + N] colonnes) ===
// Colonnes: 1 (entêtes) + N (Top-1 + jusqu'à 2 alternatives)
const tblPreds = (() => {
  const top1 = {
    label: observation.result.top1.label ?? "—",
    percent: observation.result.top1.percent ?? 0,
    isTop1: true,
  };
  if (observation.result.abstained) return [top1];
  const alts = (observation.result.alts ?? [])
    .filter(a => (a.percent ?? 0) > 0 && a.label !== observation.result.top1.label)
    .slice(0, 2)
    .map(a => ({ label: a.label ?? "—", percent: a.percent ?? 0, isTop1: false }));
  return [top1, ...alts];
})();

const tblPredCols = Math.max(1, Math.min(3, tblPreds.length)); // nb de colonnes de prédictions
const tblPad   = 3;   // padding interne des cellules (mm)
const tblCellH = 12;  // hauteur d'une cellule (mm) -> total 2 lignes
const tblGapY  = 0;   // petit espacement sous le titre

ry += tblGapY;

// Largeurs: 1ère colonne d'entêtes + colonnes de prédictions
const tblLabelColW = Math.min(28, Math.max(20, rInnerW * 0.23)); // 20–28 mm
const tblPredAreaW = rInnerW - tblLabelColW;
const tblPredColW  = tblPredAreaW / tblPredCols;

// Dimensions globales
const tblX = rx;
const tblY = ry;
const tblW = tblLabelColW + tblPredAreaW;
const tblH = tblCellH * 2;

// Cadre et séparateurs
pdf.setDrawColor(220); pdf.setLineWidth(0.2);
pdf.rect(tblX, tblY, tblW, tblH);
// séparateur vertical après la colonne d'entêtes
pdf.line(tblX + tblLabelColW, tblY, tblX + tblLabelColW, tblY + tblH);
// séparateurs verticaux entre colonnes de prédiction
for (let c = 1; c < tblPredCols; c++) {
  const xSep = tblX + tblLabelColW + tblPredColW * c;
  pdf.line(xSep, tblY, xSep, tblY + tblH);
}
// séparateur horizontal entre les 2 lignes
pdf.line(tblX, tblY + tblCellH, tblX + tblW, tblY + tblCellH);

// Helper: centre horizontal + vertical (1 ligne max) avec métriques réelles
const tblCenterBoth = (
  txt: string,
  cellX: number, cellY: number, cellW: number, cellH: number,
  bold = false, fs = 12
) => {
  const snap = (v: number) => Math.round(v * 100) / 100;

  // 1) police/taille
  pdf.setFont("times", bold ? "bold" : "normal");
  pdf.setFontSize(fs);

  // 2) garde une seule ligne tronquée à la largeur utile
  const maxW = Math.max(0, cellW - 2 * tblPad);
  const line = (pdf.splitTextToSize(txt, maxW) as string[])[0] ?? "—";

  // 3) mesure précise
  const tw = pdf.getTextWidth(line);
  const dims = (pdf as any).getTextDimensions
    ? (pdf as any).getTextDimensions(line)
    : { h: fs * 0.7 }; // fallback
  const th = Math.max(0, dims?.h ?? fs * 0.7);

  // Note: jsPDF ne donne pas l'ascender séparé → on approxime à ~0.8 de la hauteur
  const ASCENT_FACTOR = 0.80;
  const ascent = th * ASCENT_FACTOR;

  // 4) calcule le point (x, y_baseline)
  const tx = cellX + (cellW - tw) / 2;
  const ty = cellY + (cellH - th) / 2 + ascent;

  pdf.text(line, snap(tx), snap(ty));
};
const tblPct = (p?: number) =>
  typeof p === "number" ? `${(Math.round((p ?? 0) * 10) / 10).toFixed(1)} %` : "—";

// Colonne 0 (entêtes): "Roches" (ligne 1) / "Confiance" (ligne 2)
tblCenterBoth("Roches",    tblX,             tblY,              tblLabelColW, tblCellH, true, 12);
tblCenterBoth("Confiance", tblX,             tblY + tblCellH,   tblLabelColW, tblCellH, true, 12);

// Colonnes de prédiction
for (let i = 0; i < tblPredCols; i++) {
  const p = tblPreds[i];
  const cellX = tblX + tblLabelColW + tblPredColW * i;
  // ligne 1: libellé
  tblCenterBoth(p.label,   cellX,           tblY,            tblPredColW, tblCellH, p.isTop1, 12);
  // ligne 2: pourcentage
  tblCenterBoth(tblPct(p.percent), cellX,   tblY + tblCellH, tblPredColW, tblCellH, p.isTop1, 11);
}

// avance sous le tableau
ry = tblY + tblH + 10;

// === Couverture / Autres classes (résumé) ===
const shownPercents = tblPreds.map(p => Math.max(0, Math.min(100, p.percent)));
const coverage = shownPercents.reduce((s, v) => s + v, 0);
const remainder = Math.max(0, 100 - coverage);

pdf.setFont("times", "italic"); pdf.setFontSize(11);
pdf.text(`Couverture Top-${shownPercents.length} : ${coverage} %`, rx, ry); ry += 5;
pdf.text(`Autres classes : ${remainder} %`, rx, ry);     ry += 2;


  // Aligne la base de la zone 2 colonnes sur le plus bas des deux cadres
  colBottom = Math.max(colBottom, rightBlockY + rightBlockH);

  // ligne de séparation sous la zone 2 colonnes
  const yAfterColumns = colBottom + 6;   // on ajoute juste un espace visuel
  pdf.setLineWidth(0.2);
  pdf.line(margin, yAfterColumns, pageW - margin, yAfterColumns);
  y = yAfterColumns + 4;


  // === BLOC 2 : Fiche (gauche) + Notes/Coordonnées (droite en 2 sous-colonnes) ===
  // Hauteur fixe pour les colonnes inférieures
  const LOWER_H = 180;
  const FOOTER_SAFE = 12; // espace de sécurité avant footer
  const maxPossible = pageH - margin - FOOTER_SAFE - y;
  const sectH = Math.min(LOWER_H, Math.max(50, maxPossible)); // borne basse 50mm

  const sectX = margin;
  const sectY = y + 4;
  const sectW = pageW - margin * 2;
  const colGap = 8;
  const leftW  = Math.floor((sectW - colGap) * 0.55); // 55% fiche à gauche
  const rightW = sectW - colGap - leftW;
  const leftX  = sectX;
  const rightX = sectX + leftW + colGap;

  // Cadres extérieurs (hauteur FIXE)
  pdf.setDrawColor(230); pdf.setLineWidth(0.2);
  pdf.rect(leftX,  sectY, leftW,  sectH);
  pdf.rect(rightX, sectY, rightW, sectH);

  // --- Colonne gauche : Fiche Top-1 (défile dans un cadre de hauteur sectH) ---
  let ly = sectY + 6;  // padding interne
  const lpadX = leftX + 4;
  const innerLW = leftW - 8;
  ly = titleWithRule(pdf, "Fiche d'identification", lpadX, ly, {
    align: "center",
    containerW: innerLW,
    ruleMode: "text",
    textScale: 1,
    ruleMax: 48
  });


  const rock = observation.top1Rock ?? {};
  const maxLy = sectY + sectH - 6;

  // clé/valeurs avec arrêt si dépassement
  const kvWithin = (label: string, value: string | undefined) => {
    if (!value) return;
    const nextY = kv(pdf, label, value, lpadX, ly, innerLW, { gapAfter: 3, labelSize: 12, valueSize: 12, lineH: 5 });
    if (nextY > maxLy) { ly = maxLy; return; }
    ly = nextY;
  };

  kvWithin("Nom", rock.nom);
  kvWithin("Type", rock.type);
  kvWithin("Texture", rock.texture);
  kvWithin("Minéraux principaux", rock.mineraux_principaux);
  kvWithin("Minéraux secondaires", rock.mineraux_secondaires);
  kvWithin("Densité (g/cm³)", rock.densite_g_cm3);
  kvWithin("Dureté (Mohs)", rock.durete_Mohs);
  kvWithin("Contexte de formation", rock.contexte);
  kvWithin("Astuces terrain", rock.astuces_terrain);

    // --- Colonne droite : deux LIGNES empilées (Notes en haut, Coordonnées en bas) ---
  const rowGap = 6;                 // espace entre les deux lignes
  const rowPad = 4;                 // padding intérieur
  const rowInnerW = rightW - rowPad * 2;

  // Calcule la hauteur de chaque ligne (moitié-moitié)
  const rowH = Math.floor((sectH - rowGap) / 2);

  // Séparateur horizontal (plus visible que les cadres si tu veux marquer la demi-hauteur)
  pdf.setDrawColor(210); pdf.setLineWidth(0.3);
  const midY = sectY + rowH + rowGap / 2;
  pdf.line(rightX, midY, rightX + rightW, midY);

  // --- Ligne 1 : Notes ---
  let notesX = rightX + rowPad;
  let notesY = sectY + rowPad + 2;
  pdf.setDrawColor(0); // réinitialise
  notesY = titleWithRule(pdf, "Notes", notesX, notesY, {
    align: "center",
    containerW: rowInnerW,
    ruleMode: "text",
    textScale: 1,
    ruleMax: 48,
  });

  if (observation.notes?.trim()) {
    const availH = (sectY + rowH) - notesY - rowPad;
    const res = writeWithin(
      pdf,
      observation.notes.trim(),
      notesX,
      notesY,
      rowInnerW,
      Math.max(0, availH),
      12,
      { family: "times", style: "normal" },
      5
    );
    if (res.truncated) {
      pdf.setFont("times","italic"); pdf.setFontSize(9);
      const hintY = Math.min(sectY + rowH - rowPad, res.nextY + 4);
      pdf.text("… (tronqué)", notesX, hintY);
    }
  } else {
    pdf.setFont("times","italic"); pdf.setFontSize(10);
    pdf.text("— Aucune note —", notesX, notesY);
  }

  // --- Ligne 2 : Coordonnées ---
  let coordsX = rightX + rowPad;
  let coordsY = sectY + rowH + rowGap + rowPad + 2;
  coordsY = titleWithRule(pdf, "Coordonnées", coordsX, coordsY, {
    align: "center",
    containerW: rowInnerW,
    ruleMode: "text",
    textScale: 1,
    ruleMax: 48,
  });

  const lines = observation.geo?.coords ?? [];
  const g = parseSimpleGeo(lines);

  const row2Bottom = sectY + rowH + rowGap + rowH - rowPad;
  const spaceH = Math.max(0, row2Bottom - coordsY);

  // fonction K/V contrainte à la hauteur dispo de la 2e ligne
  const kvRow2 = (label: string, value?: string) => {
    if (!value) return;
    // simule la hauteur consommée, puis n'écrit que si on reste dans la fenêtre
    const probe = pdf.splitTextToSize(value, rowInnerW) as string[];
    const consumed = 5 /*label*/ + (probe.length * 5) + 3 /*gap*/;
    if (coordsY + consumed > row2Bottom) return;
    coordsY = kv(pdf, label, value, coordsX, coordsY, rowInnerW, { gapAfter: 3, labelSize: 12, valueSize: 12, lineH: 5 });
  };

  if (g.lat !== undefined || g.lon !== undefined || g.alt !== undefined || g.source) {
    kvRow2("Latitude (°)",  fmtDeg(g.lat));
    kvRow2("Longitude (°)", fmtDeg(g.lon));
    kvRow2("Altitude (m)",  fmtAlt(g.alt));
    kvRow2("Source",        g.source);
  } else if (lines.length) {
    // affichage brut tronqué dans la hauteur de la ligne 2
    writeWithin(pdf, lines.join("\n"), coordsX, coordsY, rowInnerW, spaceH, 11, { family: "times", style: "normal" }, 5);
  } else {
    pdf.setFont("times","italic"); pdf.setFontSize(10);
    pdf.text("— Non renseignées —", coordsX, coordsY);
  }

  // avance le curseur global sous le bloc inférieur (hauteur FIXE)
  y = sectY + sectH + 12;

  // --- footer inchangé ---
  pdf.setFont("times", "normal"); pdf.setFontSize(9);
  pdf.text(`Litho-SCAN — export local (A4) • © ${pad(d.getFullYear())}`, margin, pageH - margin + 3);

  pdf.setProperties({
    title: "Litho-SCAN – Rapport d’analyse",
    subject: "Identification de roche",
    author: "Litho-SCAN",
  });

  return pdf.output("arraybuffer");
}