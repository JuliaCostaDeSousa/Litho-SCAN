// src/ResultsPage.tsx
import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { TransferStore } from "./lib/transfer";
import type { GeoPoint, PredictResult, ExportResult, RockInfo } from "./types/observation";
import { getBrowserPosition } from "./services/gps/GPSService";
import mapResultForExport from "./utils/mapResultsForExport"
import FramedPreview from "./components/ui/FramedPreview"
import ImageButton from "./components/ui/ImageMaskedButton"

const VITE_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`;

type ExportNavState = {
  from: "results";
  exportResult: ExportResult;
  geoCandidates?: { browser?: string[]; exif?: string[]; manual?: string[] };
  top1Rock: RockInfo;
};

type NavStateResults = { from?: string; file?: Blob; result?: PredictResult; preview?: string; exifGeo?: GeoPoint } | null;

export default function ResultsPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: NavStateResults };
  const [file, setFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string>();
  const [rockInfos, setRockInfos] = useState<any[] | null>(null);
  const [, setInfoLoading] = useState(false);
  const [, setInfoError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const didInit = useRef(false);

  const result = state?.result;
  const isAbstained = !!result?.abstained;

  // ---------- State bootstrap (state -> peek -> take) ----------
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const fromState = state?.file ?? null;
    const fromPeek  = fromState ? null : (TransferStore.peek?.() ?? null);
    const fromTake  = (fromState || fromPeek) ? null : (TransferStore.take?.() ?? null);
    const found = fromState ?? fromPeek ?? fromTake ?? null;

    if (!found) {
      // pas de blob → retour accueil
      navigate("/", { replace: true, state: null });
      return;
    }
    setFile(found);
  }, [state, navigate]);

  // ---------- Preview URL ----------
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ---------- Mapping prédictions ----------
  const confByLabel = new Map((result?.top3 ?? []).map(t => [t.label.toLowerCase(), t.percent]));
  const getPercent = (label?: string | null) =>
    typeof label === "string" ? confByLabel.get(label.toLowerCase()) : undefined;

  const top1Percent = getPercent(result?.top1_label) ?? Math.round((result?.top1_conf ?? 0) * 100);
  const isCertain = top1Percent === 100;

  const MODEL_TO_DB: Record<string, string> = {
    basalte: "Basalte", calcaire: "Calcaire", granite: "Granite", gres: "Grès", schiste: "Schiste",
  };
  const prettyLabel = (lab?: string | null) => {
    if (typeof lab !== "string" || lab.trim() === "") return "—";
    return MODEL_TO_DB[lab.toLowerCase() as keyof typeof MODEL_TO_DB] ?? lab;
  };

  const modelLabels =
    !result || isAbstained ? [] : (isCertain ? [result.top1_label!].filter(Boolean) as string[] : result.top3.map(t => t.label));

  const toQuery = modelLabels.map(lab => {
    const nomDb = MODEL_TO_DB[lab.toLowerCase() as keyof typeof MODEL_TO_DB];
    const pct = getPercent(lab) ?? (isCertain ? 100 : undefined);
    return nomDb ? { labelModel: lab, nomDb, percent: pct } : null;
  }).filter(Boolean) as { labelModel: string; nomDb: string; percent?: number }[];

  // ---------- Fetch infos roches ----------
  useEffect(() => {
    if (!result || isAbstained) { setRockInfos(null); setInfoLoading(false); setInfoError(null); return; }
    if (toQuery.length === 0)   { setRockInfos([]);   setInfoLoading(false); setInfoError(null); return; }
    if (!VITE_API_BASE_URL)     { setRockInfos([]);   setInfoError("API non configurée (VITE_API_BASE_URL)."); return; }

    const ac = new AbortController();
    setInfoLoading(true); setInfoError(null);

    (async () => {
      try {
        const settled = await Promise.allSettled(
          toQuery.map(item =>
            fetch(`${VITE_API_BASE_URL}/rocks?nom=${encodeURIComponent(item.nomDb)}`, {
              signal: ac.signal, headers: { Accept: "application/json" },
            }) .then(async r => {
              if (!r.ok) throw new Error(String(r.status));
              const json = await r.json();
              const row = Array.isArray(json) ? json[0] : json; // ← support array/object
              if (!row || Object.keys(row).length === 0) throw new Error("empty");
              return { item, row };
            })
          )
        );

        const inOrder: Array<any & { __percent?: number }> = [];
        toQuery.forEach(q => {
          const hit = settled.find(s => s.status === "fulfilled" && s.value.item.nomDb === q.nomDb) as
            | { status: "fulfilled"; value: { item: typeof q; row: any } }
            | undefined;
          if (hit) inOrder.push({ ...hit.value.row, __percent: q.percent });
        });

      setRockInfos(inOrder);
      if (inOrder.length === 0) {
        // Optional: minimal UX to indicate why there’s no card
        setInfoError("Aucune fiche trouvée pour ces prédictions.");
      }
      } catch (e: any) {
        if (e?.name !== "AbortError") { setRockInfos(null); setInfoError("Impossible de récupérer les fiches."); }
      } finally {
        setInfoLoading(false);
      }
    })();

    return () => ac.abort();
  }, [result, isAbstained, VITE_API_BASE_URL, JSON.stringify(toQuery)]);

  useEffect(() => {
    if (!rockInfos) return;
    if (activeIdx > rockInfos.length - 1) setActiveIdx(0);
  }, [rockInfos, activeIdx]);

  if (!file) {
    return (
      <section className="mx-auto max-w-md px-4 py-8 text-center text-white">
        <p className="text-red-300 font-medium mb-4">Aucune donnée à afficher.</p>
        <ImageButton
          src="/ui/btn-full.png"
          label="Retour à l’accueil"
          onClick={() => navigate("/")}
          fluid
          minWidth={220}
          maxWidth={360}
          aspect={3.2}
          hoverEffect={false}
        />
      </section>
    );
  }

  const canExport = !!file && !!result && !result.abstained && !!result.top1_label;

  async function onExportPdfClick() {
    if (!file || !result || isAbstained || exporting) return;
    setExporting(true);
    try {
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

      const exportResult: ExportResult = mapResultForExport(result, prettyLabel);
      TransferStore.set(file); // conserver l’image pour /exportPdf
      navigate("/exportPdf", {
        state: {
          from: "results",
          exportResult,
          geoCandidates: Object.keys(geoCandidates).length ? geoCandidates : undefined,
          top1Rock: rockInfos?.[0],
        } satisfies ExportNavState
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl px-4 text-white">
      {/* Ligne du haut: preview (col 1) + prédictions (col 2) */}
      <div className="grid grid-cols-1 md:grid-cols-[240px,1fr] gap-4 items-start
                      justify-items-center md:justify-items-start min-w-0">
        {/* Colonne 1 = PREVIEW */}
        <aside className="min-w-0 justify-self-center md:justify-self-center">
          <FramedPreview
            size={224}
            innerPadding={8}
            frameSrc="/ui/frame-224.png"
            imgSrc={preview}
            alt="Photo scannée"
            frameZ="above"
          />
        </aside>

        {/* Colonne 2 = PRÉDICTIONS */}
        <aside className="min-w-0 w-full">
          <div className="w-full max-w-[520px] mx-auto">  {/* ← cap + centrage */}
            <div className="space-y-3 max-h-[180px] md:h-[160px] overflow-y-auto pr-2
                            [scrollbar-color:theme(colors.white/.4)_transparent]
                            [scrollbar-width:thin] min-w-0">
              {!!result && (
                <>
                  <h2 className="text-center md:text-left text-lg md:text-xl font-semibold sticky top-0 pb-1 truncate md:justify-self-center">
                    {isAbstained ? "Image non reconnue"
                                : `${prettyLabel(result?.top1_label) ?? "—"} — ${top1Percent}%`}
                  </h2>

                  {!isAbstained && result && !isCertain && (() => {
                    const alts = (result.top3 ?? []).filter(
                      (t) => (result.top1_label ?? "").toLowerCase() !== t.label.toLowerCase()
                          && (t.percent ?? 0) > 0
                    );
                    if (!alts.length) return null;

                    return (
                      <div className="text-sm min-w-0 md:justify-self-center">
                        <div className="font-medium">Autres prédictions</div>
                        <ul className="mt-2 space-y-1 md:justify-self-center">
                          {alts.map((t) => (
                            <li key={t.index} className="flex w-full items-center gap-3">
                              <span className="truncate">{prettyLabel(t.label)}</span>
                              <span className="font-semibold tabular-nums shrink-0">{t.percent}%</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Séparateur */}
      <hr className="my-8 border-white/20" />

      {/* Onglets + fiche informative — largeur et hauteur fixées + scroll interne */}
      <section className="grid gap-6">
        {rockInfos && rockInfos.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2">
            {rockInfos.slice(0, 3).map((r, i) => {
              const isActive = activeIdx === i;
              return (
                <div
                  key={r.id ?? i}
                  className={[
                    "rounded-[12px] transition",
                    isActive ? "ring-2 ring-[#17BDCD]/70 ring-offset-2 ring-offset-transparent" : ""
                  ].join(" ")}
                >
                  <ImageButton
                    src="/ui/btn-full.png"    // tu gardes le même PNG
                    label={`Top-${i + 1}`}    // “placeholder” ici = le label affiché
                    onClick={() => setActiveIdx(i)}
                    /*width={130}               // ← adapte la taille
                    height={56}               // ← adapte la taille*/
                    fluid
                    minWidth={220}
                    maxWidth={360}
                    aspect={3.2}
                    hoverEffect={false}       // cohérent avec le style actuel
                    className={isActive ? "" : "opacity-95"} // légère différence si tu veux
                  />
                </div>
              );
            })}
          </div>
        )}

        {rockInfos && rockInfos.length > 0 ? (
          <article
            className="w-full max-w-[560px] mx-auto rounded-xl border border-white/15 shadow-sm
                      h-[360px] sm:h-[420px] overflow-y-auto pr-3
                      [scrollbar-color:theme(colors.white/.4)_transparent]
                      [scrollbar-width:thin]
                      bg-black/60"
          >
            {(() => {
              const r = rockInfos[Math.min(activeIdx, rockInfos.length - 1)];
              return (
                <div className="p-4 space-y-3 text-sm leading-relaxed">
                  {!isCertain && (
                    <h4 className="text-lg font-semibold text-center sticky top-0 bg-transparent/60 backdrop-blur-[1px] pb-2">
                      {r.nom}
                    </h4>
                  )}

                  {/* petits blocs “aérés” */}
                  {r.type && (
                    <div><span className="text-white/90 font-medium">Type :</span> {r.type}</div>
                  )}
                  {r.texture && (
                    <div><span className="text-white/90 font-medium">Texture :</span> {r.texture}</div>
                  )}
                  {r.mineraux_principaux && (
                    <div>
                      <span className="text-white/90 font-medium">Minéraux principaux :</span> {r.mineraux_principaux}
                    </div>
                  )}
                  {r.mineraux_secondaires && (
                    <div>
                      <span className="text-white/90 font-medium">Minéraux secondaires :</span> {r.mineraux_secondaires}
                    </div>
                  )}
                  {r.densite_g_cm3 && (
                    <div>
                      <span className="text-white/90 font-medium">Densité (g/cm³) :</span> {r.densite_g_cm3}
                    </div>
                  )}
                  {r.durete_Mohs && (
                    <div>
                      <span className="text-white/90 font-medium">Dureté (Mohs) :</span> {r.durete_Mohs}
                    </div>
                  )}
                  {r.contexte && (
                    <div>
                      <span className="text-white/90 font-medium">Contexte de formation :</span> {r.contexte}
                    </div>
                  )}
                  {r.astuces_terrain && (
                    <div>
                      <span className="text-white/90 font-medium">Astuces terrain :</span> {r.astuces_terrain}
                    </div>
                  )}
                </div>
              );
            })()}
          </article>
        ): rockInfos && rockInfos.length === 0 ? (
          <p className="text-center text-sm text-white/80">
            Aucune fiche trouvée pour ces prédictions.
          </p>
        ) : null}
      </section>

      {/* Actions (boutons) */}
      <section className="mt-8 text-center space-y-3">
        <div>
          <ImageButton
            src="/ui/btn-full.png"
            label={exporting ? "Préparation…" : "Export PDF"}
            onClick={onExportPdfClick}
            fluid
            minWidth={220}
            maxWidth={360}
            aspect={3.2}
            hoverEffect={false}
            // @ts-ignore
            disabled={!canExport || exporting}
          />
          {!canExport && (
            <p className="mt-2 text-xs text-white/70">
              L’export s’active dès qu’une prédiction Top-1 est disponible.
            </p>
          )}
        </div>
        <div>
          <ImageButton
            src="/ui/btn-full.png"
            label="Accueil"
            onClick={() => navigate('/', { replace: true })}
            fluid
            minWidth={220}
            maxWidth={360}
            aspect={3.2}
            hoverEffect={false}
          />
        </div>
      </section>
    </section>
  );
}
// -------- helpers --------
function buildGeoLines(lat: number, lon: number, sourceLabel?: string): string[] {
  const lines: string[] = [];
  lines.push(fmtLatLon(lat, lon));
  if (sourceLabel) lines.push(`source: ${sourceLabel}`);
  return lines;
}
function fmtLatLon(lat: number, lon: number): string {
  const f = (v: number) => v.toFixed(5);
  return `${f(lat)}, ${f(lon)}`;
}
