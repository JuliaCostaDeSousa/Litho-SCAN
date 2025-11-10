import type { PredictResult, ExportResult } from "../types/observation";

export default function mapResultForExport(
  result: PredictResult,
  pretty: (raw: string | null | undefined) => string
): ExportResult {
  const rawTop1 = result.top1_label ?? "—";
  const top1Pretty = pretty(rawTop1);

  const percentMap = new Map(
    (result.top3 ?? []).map(t => [t.label?.toLowerCase(), t.percent])
  );

  const top1Pct = (() => {
    const p = percentMap.get(rawTop1?.toLowerCase());
    if (typeof p === "number") return Math.round(p);
    return Math.round((result.top1_conf ?? 0) * 100);
  })();

  const alts = (result.top3 ?? [])
    .filter(t => (t.label ?? "").toLowerCase() !== rawTop1.toLowerCase())
    .map(t => ({
      label: pretty(t.label),
      percent: Math.round(
        typeof t.percent === "number" ? t.percent : Math.max(0, Math.min(1, t.prob ?? 0)) * 100
      ),
    }))
    .filter(a => a.percent > 0)
    .slice(0, 2);

  return {
    abstained: result.abstained,
    top1: { label: top1Pretty, percent: top1Pct },
    alts,
  };
}
