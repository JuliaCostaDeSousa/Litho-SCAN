import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { TransferStore } from "./lib/transfer";
import type { GeoPoint, PredictResult, ExportResult, RockInfo } from "./types/observation";
import { getBrowserPosition } from "./services/gps/GPSService";
import SquarePreview from "./components/SquarePreview"
import mapResultForExport from "./utils/mapResultsForExport"

const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL

type ExportNavState = {
  from: "results";
  exportResult: ExportResult;
  geoCandidates?: {
    browser?: string[]; // ex: ["48.85661, 2.35222", "±8 m", "source: browser"]
    exif?: string[];   // ex: ["48.85661, 2.35222", "source: exif"]
    manual?: string[]; // ex: ["Saisie: …"]
  };
  top1Rock: RockInfo;
};

//type NavStateResults = { from?: string; result?: PredictResult; file?: Blob } | null;
type NavStateResults = { from?: string, file?: Blob, result?: PredictResult; preview?: string; exifGeo?: GeoPoint } | null;

function ResultsPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: NavStateResults };
  const [file, setFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string>();
  const [rockInfos, setRockInfos] = useState<any[] | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  
  const result = state?.result;

  const confByLabel = new Map(
    (result?.top3 ?? []).map(t => [t.label.toLowerCase(), t.percent])
  );

  const getPercent = (label?: string | null) =>
  typeof label === "string"
    ? confByLabel.get(label.toLowerCase())
    : undefined;

  const isAbstained = !!result?.abstained;
  const top1Percent = getPercent(result?.top1_label) ?? Math.round((result?.top1_conf ?? 0) * 100);
  const isCertain = top1Percent === 100;

  // Liste des labels modèle, dans l'ordre Top-3
  const modelLabels = !result || isAbstained
  ? []
  : (isCertain
      ? [result.top1_label].filter(Boolean) as string[]
      : result.top3.map(t => t.label));
  
  const MODEL_TO_DB: Record<string, string> = {
    basalte: "Basalte",
    calcaire: "Calcaire",
    granite: "Granite",
    gres:     "Grès",
    schiste:  "Schiste",
  };

  function prettyLabel(lab?: string | null): string {
    if (typeof lab !== "string" || lab.trim() === "") return "—";
    const m = MODEL_TO_DB[lab.toLowerCase() as keyof typeof MODEL_TO_DB];
    return m ?? lab;
  }

  // triplets { labelModel, nomDb, percent }
  const toQuery = modelLabels.map(lab => {
    const nomDb = MODEL_TO_DB[lab.toLowerCase() as keyof typeof MODEL_TO_DB];
    const pct = getPercent(lab) ?? (isCertain ? 100 : undefined);
    return nomDb ? { labelModel: lab, nomDb, percent: pct } : null;
  }).filter(Boolean) as { labelModel: string; nomDb: string; percent?: number }[];

  useEffect(() => {
    if (!rockInfos) return;
    if (activeIdx > rockInfos.length - 1) setActiveIdx(0);
  }, [rockInfos, activeIdx]);

  useEffect(() => {
    // 1) d’abord via state ; 2) sinon via le stash en secours
    const fromState = state?.file ?? null;
    const fromStash = TransferStore.take();
    const found = fromState ?? fromStash ?? null;

    if (!found) {
      navigate("/", { replace: true, state: null });
      return;
    }
    setFile(found);
  }, [state, navigate]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    // 0) Cas "je ne sais pas" → pas d’appels
    if (!result || isAbstained) {
      setRockInfos(null);
      setInfoLoading(false);
      setInfoError(null);
      return;
    }

    if (toQuery.length === 0) {
      setRockInfos([]);
      setInfoLoading(false);
      setInfoError(null);
      return;
    }

    // 2) Garde-fous ENV
    if (!VITE_API_BASE_URL) {
      console.warn("VITE_API_BASE_URL manquant");
      setRockInfos([]);
      setInfoError("API non configurée (VITE_API_BASE_URL).");
      return;
    }

    // 3) Lancer les appels en parallèle, annulables
    const ac = new AbortController();
    setInfoLoading(true);
    setInfoError(null);

    (async () => {
      try {
        const promises = toQuery.map(item =>
          fetch(`${VITE_API_BASE_URL}/rocks?nom=${encodeURIComponent(item.nomDb)}`, {
            signal: ac.signal, headers: { Accept: "application/json" },
          }).then(async (r) => {
            if (!r.ok) throw new Error(String(r.status));
            const row = await r.json();
            return { item, row }; // on garde percent ici
          })
        );

        const settled = await Promise.allSettled(promises);

        // 4) Conserver l’ordre d’entrée et ignorer les échecs (404/500)
        const inOrder: Array<any & { __percent?: number }> = [];
        toQuery.forEach(q => {
          const hit = settled.find(s =>
            s.status === "fulfilled" && s.value.item.nomDb === q.nomDb
          ) as { status: "fulfilled"; value: { item: typeof q; row: any } } | undefined;

          if (hit) {
            const withPct = { ...hit.value.row, __percent: q.percent };
            inOrder.push(withPct);
          }
        });

        setRockInfos(inOrder);
      } catch (e: any) {
        if (e?.name === "AbortError") return; // navigation/cleanup
        setRockInfos(null);
        setInfoError("Impossible de récupérer les fiches.");
      } finally {
        setInfoLoading(false);
      }
    })();

    return () => ac.abort();
  }, [result, isAbstained, VITE_API_BASE_URL, JSON.stringify(toQuery)]);

  if (!file) return <p>Redirection…</p>;

  const canExport =
    Boolean(file) &&
    Boolean(result) &&
    !result?.abstained &&
    Boolean(result?.top1_label);


  async function onExportPdfClick() {
    if (!file || !result || isAbstained || exporting) return;
    setExporting(true);
    try {
      // Geo candidates (idem ton code)
      let browserLines: string[] | undefined;
      try {
        const pos = await getBrowserPosition();
        if (pos) browserLines = buildGeoLines(pos.latitude, pos.longitude, pos.source);
      } catch {}
      let exifLines: string[] | undefined;
      const exifPos = state?.exifGeo;
      if (exifPos) exifLines = buildGeoLines(exifPos.latitude, exifPos.longitude, "EXIF");

      const geoCandidates: NonNullable<ExportNavState>["geoCandidates"] = {};
      if (browserLines?.length) geoCandidates.browser = browserLines;
      if (exifLines?.length)    geoCandidates.exif    = exifLines;

      // nouveau payload d’export
      const exportResult: ExportResult = mapResultForExport(result, prettyLabel);
      TransferStore.set(file);
      navigate("/exportPdf", {
        state: {
          from: "results",
          exportResult,
          geoCandidates: Object.keys(geoCandidates).length ? geoCandidates : undefined,
          top1Rock: rockInfos?.[0],
        } satisfies NonNullable<ExportNavState>
      });
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      {preview
        ? <SquarePreview src={preview} alt="Photo scannee" size={224} fit="cover" decoding="async" loading="eager" />
        : <div className="w-60 h-40 bg-gray-800/40 rounded" aria-label="Aperçu indisponible" />
      }
      
      {!!result && (
        <div className="mt-4">
          <h2 className="text-center font-semibold">
            {isAbstained
              ? "Image non reconnue"
              : `${prettyLabel(result?.top1_label) ?? "—"} — ${top1Percent}%`}
          </h2>

          {/* Autres prédictions — uniquement si non certain et s'il reste des % > 0 */}
          {!isAbstained && result && !isCertain && (() => {
            const alts = (result.top3 ?? []).filter(
              (t) =>
                (result.top1_label ?? "").toLowerCase() !== t.label.toLowerCase() &&
                (t.percent ?? 0) > 0
            );

            if (alts.length === 0) return null;

            return (
              <div className="mt-6 text-center">
                <strong>{alts.length > 1 ? "Autres prédictions" : "Autre prédiction"} :</strong>
                <div className="mt-2 space-y-1 text-sm">
                  {alts.map((t) => (
                    <div key={t.index}>
                      <div>{prettyLabel(t.label)}: <strong>{t.percent}%</strong></div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <section className="mt-6" aria-live="polite">
        {isAbstained && (
          <div className="mt-10 text-center">
            <p className="text-sm mb-4">
              Essaie un nouveau scan avec une photo plus nette / une autre lumière.
            </p>

            <button aria-label="Nouveau scan"
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              Nouveau scan
            </button>
          </div>
        )}


        {!isAbstained && !!result && (
          <div className="mt-8" aria-live="polite">
            <hr className="my-8 border-gray-600/40 w-2/3 mx-auto" />

            {infoLoading && <p className="text-sm mt-2">Chargement des informations…</p>}

            {!infoLoading && infoError && (
              <p className="text-sm mt-2 text-red-600">{infoError}</p>
            )}

            {!infoLoading && !infoError && rockInfos && rockInfos.length === 0 && (
              <p className="text-sm mt-2">
                Aucune fiche trouvée pour ces labels. Tu peux relancer un scan.
              </p>
            )}

            {!infoLoading && !infoError && rockInfos && rockInfos.length > 0 && (
              <div className="mt-3 grid gap-8">
                {/* --- Onglets --- */}
                {rockInfos.length > 1 && (
                  <div className="flex justify-center gap-2">
                    {rockInfos.slice(0, 3).map((r, i) => (
                      <button
                        key={r.id ?? i}
                        type="button"
                        onClick={() => setActiveIdx(i)}
                        className={[
                          "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                          activeIdx === i
                            ? "bg-green-600 text-white border-green-600"
                            : "bg-transparent text-gray-200 border-gray-500 hover:border-gray-300"
                        ].join(" ")}
                        aria-pressed={activeIdx === i}
                      >
                        {`Top-${i + 1}`}
                      </button>
                    ))}
                  </div>
                )}

                {/* --- Fiche détaillée de l'onglet actif --- */}
                <article className={`rounded-xl border p-4 shadow-sm ${isCertain ? 'mt-2' : ''}`}>
                  {(() => {
                    const r = rockInfos[Math.min(activeIdx, rockInfos.length - 1)];
                    return (
                      <>
                        {/* Affiche le nom seulement si ce n'est pas un cas 100% certain */}
                        {!isCertain && (
                          <h4 className="text-lg font-semibold text-center">
                            {r.nom}
                          </h4>
                        )}

                        {r.type && (
                          <p className="text-sm mt-2">
                            <strong>Type :</strong> {r.type}
                          </p>
                        )}
                        {r.texture && (
                          <p className="text-sm mt-2">
                            <strong>Texture :</strong> {r.texture}
                          </p>
                        )}
                        {r.mineraux_principaux && (
                          <p className="text-sm mt-2">
                            <strong>Minéraux principaux :</strong> {r.mineraux_principaux}
                          </p>
                        )}
                        {r.mineraux_secondaires && (
                          <p className="text-sm mt-2">
                            <strong>Minéraux secondaires :</strong> {r.mineraux_secondaires}
                          </p>
                        )}
                        {r.densite_g_cm3 && (
                          <p className="text-sm mt-2">
                            <strong>Densité (g/cm³) :</strong> {r.densite_g_cm3}
                          </p>
                        )}
                        {r.durete_Mohs && (
                          <p className="text-sm mt-2">
                            <strong>Dureté (Mohs) :</strong> {r.durete_Mohs}
                          </p>
                        )}
                        {r.contexte && (
                          <p className="text-sm mt-2">
                            <strong>Contexte de formation :</strong> {r.contexte}
                          </p>
                        )}
                        {r.astuces_terrain && (
                          <p className="text-sm mt-2">
                            <strong>Astuces terrain :</strong> {r.astuces_terrain}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </article>

                {/* Séparateur + boutons */}
                <hr className="my-6 border-gray-600/30 w-2/3 mx-auto" />
                <button
                  aria-label="Nouveau scan"
                  type="button"
                  onClick={() => navigate('/', { replace: true })}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                >
                  Nouveau scan
                </button>

                <button
                  type="button"
                  onClick={onExportPdfClick}
                  disabled={!canExport || exporting}
                  aria-busy={exporting}
                  title={
                    !result ? "Export indisponible : pas de résultat"
                    : result.abstained ? "Pas d’export : aucune classe reconnue"
                    : !result.top1_label ? "Pas d’export : label manquant"
                    : undefined
                  }
                  className={[
                    "px-4 py-2 rounded-lg font-medium transition-colors",
                    (!canExport || exporting)
                      ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  ].join(" ")}
                >
                  {exporting ? "Préparation…" : "Export PDF"}
                </button>

                {!canExport && (
                  <p className="mt-2 text-xs text-gray-400">
                    L’export s’active dès qu’une prédiction Top-1 est disponible.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}

export default ResultsPage

function buildGeoLines(lat: number, lon: number, sourceLabel?: string): string[] {
  const lines: string[] = [];
  lines.push(fmtLatLon(lat, lon));                          // "48.85661, 2.35222"
  if (sourceLabel) lines.push(`source: ${sourceLabel}`);    // "source: browser" | "source: exif"
  return lines;
}

function fmtLatLon(lat: number, lon: number): string {
  const f = (v: number) => v.toFixed(5); // 5 décimales, lisible
  return `${f(lat)}, ${f(lon)}`;
}
