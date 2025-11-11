import { generatePdf } from "../services/pdf/PdfService";
import dateFormat from "dateformat";
import type { ObservationForPdf } from "../types/observation"

type ToastDeps = { toast?: { success(msg: string): void; error(msg: string): void } };

function buildFilename(date: Date, label: string | null) {
  const stamp = dateFormat(date, "yyyymmdd-HHMMss");
  const base = (label ?? "export");
  let safe = base
    .replace(/[^\p{L}\p{N}_-]+/gu, "_") // garde lettres/chiffres unicode + _ -
    .replace(/_+/g, "_")                 // compacte
    .replace(/^_+|_+$/g, "")             // trim
  if (!safe) safe = "export";
  return `Litho-SCAN_${stamp}_${safe}.pdf`;
}

function download(bytes: ArrayBuffer, name: string) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url ; a.download = name ; a.click(); a.remove();
  URL.revokeObjectURL(url);
}


export async function exportObservation(
  observation: ObservationForPdf,
  deps?: ToastDeps,
): Promise<void> {
  if (!observation?.photo)  throw new Error("PHOTO_MISSING");
  if (!observation?.result) throw new Error("RESULT_MISSING");

  try {
    const bytes = await generatePdf(observation);
    const pdfname = buildFilename(new Date(), observation.result.top1.label ?? "export");
    download(bytes, pdfname);
    deps?.toast?.success?.("PDF exporté !");
  } catch (error: unknown) {
    deps?.toast?.error?.("Échec de l’export PDF.");
    throw new Error("EXPORT_FAILED", { cause: error });
  }
}
