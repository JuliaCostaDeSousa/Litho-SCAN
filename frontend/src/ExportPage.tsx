import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { TransferStore } from "./lib/transfer";
import { exportObservation } from "./controllers/ExportController"
import type { ExportResult, RockInfo } from "./types/observation";
import SquarePreview from "./components/SquarePreview"

type ExportNavState = {
  from: "results";
  exportResult: ExportResult;
  geoCandidates?: {
    browser?: string[]; // ex: ["48.85661, 2.35222", "±8 m", "source: browser"]
    exif?: string[];   // ex: ["48.85661, 2.35222", "source: exif"]
    manual?: string[]; // ex: ["Saisie: …"]
  };
  top1Rock: RockInfo;
  file?: Blob;
  preview?: string;
};

function ExportPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: ExportNavState };
  const [file, setFile] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [geoSource, setGeoSource] = useState<"none"|"browser"|"exif"|"manual">("none");
  const [geoLines, setGeoLines] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [lat, setLat] = useState<string>("");
  const [lon, setLon] = useState<string>("");
  const [alt, setAlt] = useState<string>("");
  const [latErr, setLatErr] = useState<string | null>(null);
  const [lonErr, setLonErr] = useState<string | null>(null);
  const [altErr, setAltErr] = useState<string | null>(null);

  const didInit = useRef(false);

  const isManualValid = geoSource !== "manual"
    ? true
    : (!latErr && !lonErr && !altErr && lat.trim() && lon.trim() && alt.trim());  const noteMaxLength = 400;

  function parseNum(s: string): number | undefined {
    if (!s) return undefined;
    const n = Number(s.replace(",", ".").trim());
    return Number.isFinite(n) ? n : undefined;
  }
  const DECIMAL_RE = /^\s*[+-]?(?:\d+(?:[.,]\d*)?|\d*[.,]\d+)\s*$/;

  function validateDecimal(raw: string, opts?: {
    required?: boolean;
    min?: number; max?: number;
    label?: string; // pour messages
  }): { num?: number; err?: string } {
    const label = opts?.label ?? "valeur";
    const v = raw.trim();

    if (!v) {
      if (opts?.required) return { err: `${label} requise` };
      return {}; // OK vide si non requis
    }
    if (!DECIMAL_RE.test(v)) return { err: `${label} invalide (chiffres, ',' ou '.')` };

    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n)) return { err: `${label} invalide` };

    if (typeof opts?.min === "number" && n < opts.min) return { err: `${label} < ${opts.min}` };
    if (typeof opts?.max === "number" && n > opts.max) return { err: `${label} > ${opts.max}` };

    return { num: n };
  }
  const fmtDeg5 = (n?: number) => (typeof n === "number" ? n.toFixed(5) : undefined);
  const fmtAlt0 = (n?: number) => (typeof n === "number" ? String(Math.round(n)) : undefined);

  // nettoie l’URL blob si on l’a créée ici
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    // ordre: state.file -> stash.peek -> stash.take
    const fromState = state?.file ?? null;
    const fromPeek  = fromState ? null : (TransferStore.peek?.() ?? null);
    const fromTake  = (fromState || fromPeek) ? null : (TransferStore.take?.() ?? null);
    const found = fromState ?? fromPeek ?? fromTake ?? null;

    if (found) setFile(found);

    // preview: priorise state.preview, sinon recrée depuis le blob
    if (state?.preview) {
      setPreviewUrl(state.preview);
    } else if (found) {
      const url = URL.createObjectURL(found);
      setPreviewUrl(url);
    }
  }, [state]);

  // si source == "manual"
  useEffect(() => {
    if (geoSource !== "manual") return;

    // seulement si valide : construit les lignes
    if (!isManualValid) { setGeoLines([]); return; }

    const la = parseNum(lat)!;
    const lo = parseNum(lon)!;
    const al = parseNum(alt);

    const lines: string[] = [];
    lines.push(`${fmtDeg5(la)}, ${fmtDeg5(lo)}`);
    if (al !== undefined) lines.push(`${fmtAlt0(al)} m`);
    lines.push("source: manual");
    setGeoLines(lines);
  }, [geoSource, lat, lon, alt, isManualValid]);

  useEffect(() => {
    if (geoSource !== "manual") return;

    // Valide chacune des 3 valeurs
    const latV = validateDecimal(lat, { required: true, min: -90,  max: 90,   label: "Latitude" });
    const lonV = validateDecimal(lon, { required: true, min: -180, max: 180,  label: "Longitude" });
    const altV = validateDecimal(alt, { required: true, min: -500, max: 9000, label: "Altitude" });

    const allOk = !latV.err && !lonV.err && !altV.err;
    if (!allOk) { setGeoLines([]); return; }

    const lines: string[] = [];
    lines.push(`${fmtDeg5(latV.num)}, ${fmtDeg5(lonV.num)}`);
    lines.push(`${fmtAlt0(altV.num)} m`);
    lines.push("source: manual");
    setGeoLines(lines);
  }, [geoSource, lat, lon, alt]);


  const result = state?.exportResult;
  const canExportNow =
    !!file && !!result && !result.abstained && !!result.top1.label && isManualValid;
      
  function onGeoSourceChange(next: "none"|"browser"|"exif"|"manual") {
    setGeoSource(next);
    if (next === "none") {
      setGeoLines([]);
    } else if (next === "browser" || next === "exif") {
      const g = state?.geoCandidates;
      setGeoLines(next === "browser" ? (g?.browser ?? []) : (g?.exif ?? []));
    } else {
      // manual -> rien : le useEffect construira geoLines depuis lat/lon/alt
      setGeoLines([]);
    }
  }

  async function onExportClick() {
    if (!canExportNow || !file || !result) return;
    setExporting(true);
    try {
      const observation = {
        photo: file,
        result,
        when: new Date(),
        geo: (geoSource !== "none" && geoLines.length)
            ? { source: geoSource, coords: geoLines }
            : undefined,
        top1Rock: state.top1Rock,
        notes: notes.trim() ? notes.trim() : undefined,
      };

      await exportObservation(
        observation,
        { toast: undefined }
      );
    } finally {
      setExporting(false);
    }
  }

  function setLatSafe(v: string) {
    setLat(v);
    const { err } = validateDecimal(v, { required: true, min: -90, max: 90, label: "Latitude" });
    setLatErr(err ?? null);
  }

  function setLonSafe(v: string) {
    setLon(v);
    const { err } = validateDecimal(v, { required: true, min: -180, max: 180, label: "Longitude" });
    setLonErr(err ?? null);
  }

  // Altitude désormais avec les mêmes règles (requis + bornes plausibles)
  function setAltSafe(v: string) {
    setAlt(v);
    const { err } = validateDecimal(v, { required: true, min: -500, max: 9000, label: "Altitude" });
    setAltErr(err ?? null);
  }


  return (
    <main className="grid lg:grid-cols-2 gap-8">
      <aside>
        {previewUrl
        ? <SquarePreview src={previewUrl} alt="Aperçu photo" size={224} fit="cover" decoding="async" loading="eager" />
        : <div className="h-48 bg-gray-800/40 rounded-xl" />
        }
      </aside>

      <section>
        <h1 className="text-xl font-bold mb-4">Paramètres d’export</h1>

        <div className="mt-4">
          <label className="block mb-1 font-semibold">Source de coordonnées</label>
          <select
            value={geoSource}
            onChange={(e)=>onGeoSourceChange(e.target.value as any)}
          >
            <option value="none">Aucune</option>
            {state?.geoCandidates?.browser && <option value="browser">Appareil (GPS)</option>}
            {state?.geoCandidates?.exif   && <option value="exif">EXIF</option>}
            <option value="manual">Manuel</option>
          </select>

          {geoSource !== "none" && (
            <div className="mt-2 text-sm space-y-2">
              {geoSource === "manual" ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Latitude (°) </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="48.85661"
                        value={lat}
                        onChange={(e)=>setLatSafe(e.target.value)}
                        aria-invalid={!!latErr}
                        className={`w-full rounded border px-2 py-1 ${latErr ? "border-red-500" : ""}`}
                      />
                      {latErr && <div className="text-xs text-red-600 mt-1">{latErr}</div>}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Longitude (°) </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="2.35222"
                        value={lon}
                        onChange={(e)=>setLonSafe(e.target.value)}
                        aria-invalid={!!lonErr}
                        className={`w-full rounded border px-2 py-1 ${lonErr ? "border-red-500" : ""}`}
                      />
                      {lonErr && <div className="text-xs text-red-600 mt-1">{lonErr}</div>}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Altitude (m) </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="35"
                        value={alt}
                        onChange={(e)=>setAltSafe(e.target.value)}
                        aria-invalid={!!altErr}
                        className={`w-full rounded border px-2 py-1 ${altErr ? "border-red-500" : ""}`}
                      />
                      {altErr && <div className="text-xs text-red-600 mt-1">{altErr}</div>}
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    Astuce : tu peux utiliser la virgule ou le point pour les décimales.
                  </p>

                  {/* Aperçu des lignes qui partiront au PDF */}
                  <div className="mt-1 text-xs">
                    {(geoLines?.length ? geoLines : ["—"]).map((l,i)=><div key={i}>{l}</div>)}
                  </div>
                </>
              ) : (
                // Sources browser/exif: affichage lecture seule
                <div>
                  {geoLines.length ? geoLines.map((l,i)=><div key={i}>{l}</div>) : <em>Aucune donnée pour cette source</em>}
                </div>
              )}
            </div>
          )}
        </div>


        <div className="mt-4">
          <label className="block mb-1 font-semibold">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            maxLength={noteMaxLength}
            placeholder="Observations de terrain, contexte, tests (acide, Mohs), etc."
            className="w-full resize-y rounded border p-2"
          />
          <div className="text-xs text-gray-500 mt-1">
            {notes.length}/{noteMaxLength}
          </div>
        </div>


        <div className="mt-6 flex gap-3">
          <button onClick={onExportClick}
                  disabled={!canExportNow || exporting}
                  aria-busy={exporting}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white disabled:bg-gray-600">
            {exporting ? "Export…" : "Exporter le PDF"}
          </button>

          <button onClick={()=>navigate("/")} className="px-4 py-2 rounded-lg border">
            Retour
          </button>
        </div>

        {!canExportNow && (
          <p className="mt-2 text-xs text-gray-400">
            L’export s’active quand une prédiction est disponible.
          </p>
        )}
      </section>
    </main>
  );
}

export default ExportPage