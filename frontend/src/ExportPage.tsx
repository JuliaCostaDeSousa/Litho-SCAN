import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { TransferStore } from "./lib/transfer";
import { exportObservation } from "./controllers/ExportController"
import type { ExportResult, RockInfo } from "./types/observation";
import FramedPreview from "./components/ui/FramedPreview";
import ImageButton from "./components/ui/ImageMaskedButton";

type ExportNavState = {
  from: "results";
  exportResult: ExportResult;
  geoCandidates?: {
    browser?: string[]; // ex: ["48.85661, 2.35222", "±8 m", "source: browser"]
    exif?: string[];    // ex: ["48.85661, 2.35222", "source: exif"]
    manual?: string[];
  };
  top1Rock: RockInfo;
  file?: Blob;
  preview?: string;
};

const FRAME_SIZE = 224;
const FRAME_PADDING = 8;

function ExportPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: ExportNavState };
  const [file, setFile] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();

  const [geoSource, setGeoSource] = useState<"none"|"browser"|"exif"|"manual">("none");
  const [geoLines, setGeoLines] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [notes, setNotes] = useState<string>("");

  // Champs toujours visibles
  const [lat, setLat] = useState<string>("");
  const [lon, setLon] = useState<string>("");
  const [alt, setAlt] = useState<string>("");

  // Erreurs visibles seulement en mode manuel
  const [latErr, setLatErr] = useState<string | null>(null);
  const [lonErr, setLonErr] = useState<string | null>(null);
  const [altErr, setAltErr] = useState<string | null>(null);

  const didInit = useRef(false);

  const noteMaxLength = 350;
  const isManual = geoSource === "manual";
  const hasBrowser = !!state?.geoCandidates?.browser?.length;
  const hasExif    = !!state?.geoCandidates?.exif?.length;

  // --- Helpers parse/format ---
  const DECIMAL_RE = /^\s*[+-]?(?:\d+(?:[.,]\d*)?|\d*[.,]\d+)\s*$/;
  function parseNum(s: string): number | undefined {
    if (!s) return undefined;
    const n = Number(s.replace(",", ".").trim());
    return Number.isFinite(n) ? n : undefined;
  }

  function validateDecimal(raw: string, opts?: {
    required?: boolean; min?: number; max?: number; label?: string;
  }): { num?: number; err?: string } {
    const label = opts?.label ?? "valeur";
    const v = raw.trim();
    if (!v) return opts?.required ? { err: `${label} requise` } : {};
    if (!DECIMAL_RE.test(v)) return { err: `${label} invalide (chiffres, ',' ou '.')` };
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n)) return { err: `${label} invalide` };
    if (typeof opts?.min === "number" && n < opts.min) return { err: `${label} < ${opts.min}` };
    if (typeof opts?.max === "number" && n > opts.max) return { err: `${label} > ${opts.max}` };
    return { num: n };
  }

  function clampCoordText(raw: string, maxInt = 3, maxFrac = 5): string {
    if (!raw) return raw;

    // garde seulement chiffres, séparateur décimal, et signe en 1ère position
    let s = raw.replace(/[^\d.,-]/g, '');
    s = (s.startsWith('-') ? '-' : '') + s.replace(/-/g, '').replace(/^-/, '');
    const sign = s.startsWith('-') ? '-' : '';
    let body = sign ? s.slice(1) : s;

    // garde un seul séparateur (le premier rencontré, '.' ou ',')
    const m = body.match(/[.,]/);
    const sep = m ? m[0] : null;

    if (sep) {
      const [i, f] = body.split(/[.,]/);      // on ignore les séparateurs suivants
      const intPart  = (i ?? '').replace(/\D/g, '').slice(0, maxInt);
      const fracPart = (f ?? '').replace(/\D/g, '').slice(0, maxFrac);
      return sign + intPart + sep + fracPart; // total (hors signe) ≤ maxInt + 1 + maxFrac = 9
    } else {
      const intPart = body.replace(/\D/g, '').slice(0, maxInt);
      return sign + intPart;                   // p.ex. "-12"
    }
  }
  function clampSignedInteger(raw: string, maxDigits = 9): string {
    if (!raw) return raw;
    const s = raw.trim();
    const sign = s.startsWith("-") ? "-" : "";
    const digits = s.replace(/[^\d]/g, "").slice(0, maxDigits);
    return sign + digits;
  }

  // Extrait lat/lon/alt des lignes candidates ("48.8566, 2.3522", "35 m"...)
  function linesToCoords(lines?: string[]) {
    let la: number | undefined;
    let lo: number | undefined;
    let al: number | undefined;

    if (lines && lines.length) {
      for (const l of lines) {
        // lat, lon
        if (la === undefined && lo === undefined) {
          const m = l.match(
            /([+-]?\d+(?:[.,]\d+)?)\s*,\s*([+-]?\d+(?:[.,]\d+)?)/ // "48.85, 2.35"
          );
          if (m) {
            la = parseNum(m[1]);
            lo = parseNum(m[2]);
            continue;
          }
        }
        // altitude stricte "NNN m" (ignore "±8 m" = précision GPS)
        const a = l.match(/^\s*([+-]?\d+(?:[.,]\d+)?)\s*m\s*$/i);
        if (a && !/±/.test(l)) {
          al = parseNum(a[1]);
        }
      }
    }
    return { la, lo, al };
  }

  // construction de Geolines
  useEffect(() => {
    if (geoSource !== "manual") return;

    // revalide les 3 champs en manuel
    const vLa = validateDecimal(lat, { required: true, min: -90,  max: 90,   label: "Latitude" });
    const vLo = validateDecimal(lon, { required: true, min: -180, max: 180,  label: "Longitude" });
    const vAl = validateDecimal(alt, { required: false, min: -500, max: 9000, label: "Altitude" });

    setLatErr(vLa.err ?? null);
    setLonErr(vLo.err ?? null);
    setAltErr(vAl.err ?? null);

    const ok =
      !vLa.err && !vLo.err &&
      lat.trim() && lon.trim() &&        // lat/lon obligatoires
      !vAl.err;  

    if (!ok) { setGeoLines([]); return; }

    const lines: string[] = [];
    lines.push(`${(vLa.num as number).toFixed(5)}, ${(vLo.num as number).toFixed(5)}`);
    if (typeof vAl.num === "number") lines.push(`${Math.round(vAl.num)} m`); // <- n’ajoute la ligne que si fournie
    lines.push("source: manual");
    setGeoLines(lines);
  }, [geoSource, lat, lon, alt]);

  // --- Cleanup URL blob ---
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // --- Bootstrap blob + preview
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const fromState = state?.file ?? null;
    const fromPeek  = fromState ? null : (TransferStore.peek?.() ?? null);
    const fromTake  = (fromState || fromPeek) ? null : (TransferStore.take?.() ?? null);
    const found = fromState ?? fromPeek ?? fromTake ?? null;

    if (found) setFile(found);

    if (state?.preview) setPreviewUrl(state.preview);
    else if (found) setPreviewUrl(URL.createObjectURL(found));
  }, [state]);

  // --- Geo source change: gére remplissage/lock des champs + geoLines
  function onGeoSourceChange(next: "none"|"browser"|"exif"|"manual") {
    setGeoSource(next);

    if (next === "none") {
      setGeoLines([]);
      setLat(""); setLon(""); setAlt("");
      setLatErr(null); setLonErr(null); setAltErr(null);
      return;
    }

    if (next === "browser" || next === "exif") {
      const lines = next === "browser"
        ? (state?.geoCandidates?.browser ?? [])
        : (state?.geoCandidates?.exif ?? []);
      setGeoLines(lines);

      const { la, lo, al } = linesToCoords(lines); // ta fonction existante
      setLat(la !== undefined ? la.toFixed(5) : "");
      setLon(lo !== undefined ? lo.toFixed(5) : "");
      setAlt(al !== undefined ? String(Math.round(al)) : "");
      setLatErr(null); setLonErr(null); setAltErr(null);
      return;
    }

    // "manual": on conserve lat/lon/alt (préremplis si on vient d'une source),
    // le useEffect ci-dessus fera la validation et construira geoLines.
    setGeoLines([]);
  }

    const isManualValid =
    geoSource !== "manual"
        ? true
        : (!latErr && !lonErr && lat.trim() && lon.trim() && !altErr);

  const result = state?.exportResult;
  const canExportNow =
    !!file && !!result && !result.abstained && !!result.top1.label && isManualValid;

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
      await exportObservation(observation, { toast: undefined });
    } finally {
      setExporting(false);
    }
  }

  // setters “safe” (erreurs uniquement en manuel)
  function setLatSafe(v: string) {
    const masked = (geoSource === "manual") ? clampCoordText(v, 3, 5) : v;
    setLat(masked);
    if (geoSource !== "manual") { setLatErr(null); return; }
    const { err } = validateDecimal(masked, { required: true, min: -90, max: 90, label: "Latitude" });
    setLatErr(err ?? null);
  }

  function setLonSafe(v: string) {
    const masked = (geoSource === "manual") ? clampCoordText(v, 3, 5) : v;
    setLon(masked);
    if (geoSource !== "manual") { setLonErr(null); return; }
    const { err } = validateDecimal(masked, { required: true, min: -180, max: 180, label: "Longitude" });
    setLonErr(err ?? null);
  }
  function setAltSafe(v: string) {
    const masked = (geoSource === "manual") ? clampSignedInteger(v, 9) : v;
    setAlt(masked);
    if (geoSource !== "manual") { setAltErr(null); return; }
    const { err } = validateDecimal(masked, { required: false, min: -500, max: 9000, label: "Altitude" });
    setAltErr(err ?? null);
  }

  const isLocked = geoSource === "browser" || geoSource === "exif";
  const isUnavailable =
    geoSource === "none" ||
    (geoSource === "browser" && !hasBrowser) ||
    (geoSource === "exif" && !hasExif);

  return (
    <main className="mx-auto max-w-4xl px-4 text-white">
      {/* HEADER : Preview 224 + Top-1 */}
      <section className="pt-4">
        <div className="w-full flex flex-col items-center gap-2">
          <FramedPreview
            size={FRAME_SIZE}            // 224
            innerPadding={FRAME_PADDING} // 8
            frameSrc="/ui/frame-224.png"
            imgSrc={previewUrl}
            alt="Aperçu photo"
            frameZ="above"
          />

          {/* Nom de la roche Top-1 (prend state.top1Rock.nom si dispo, sinon label du modèle) */}
          <h2 className="text-lg font-semibold text-center">
            {(state?.top1Rock?.nom ?? state?.exportResult?.top1?.label ?? "—")}
            {typeof state?.exportResult?.top1?.percent === "number"
              ? ` — ${state.exportResult.top1.percent}%`
              : ""}
          </h2>
        </div>
      </section>

      {/* FORMULAIRE : tout le reste en-dessous */}
      <section className="mt-6 space-y-4">
        <h1 className="text-xl font-bold">Paramètres d’export</h1>

        {/* Sélecteur de source */}
        <div>
          <label className="block mb-1 font-semibold">Source de coordonnées</label>
          <select
            value={geoSource}
            onChange={(e)=>onGeoSourceChange(e.target.value as any)}
            className="bg-black/50 border border-white/20 rounded-lg px-3 py-2"
          >
            <option value="none">Aucune</option>
            {hasBrowser && <option value="browser">Appareil (GPS)</option>}
            {hasExif && <option value="exif">EXIF</option>}
            <option value="manual">Manuel</option>
          </select>
        </div>

        {/* Encarts lat/lon/alt */}
        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 ${isUnavailable ? "opacity-70" : ""} min-w-0`}>
          {/* Latitude */}
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">Latitude (°)</label>
            <input
              type="text"
              inputMode="decimal"
              maxLength={10}
              placeholder="48.85661"
              value={lat}
              onChange={(e)=>setLatSafe(e.target.value)}
              aria-invalid={isManual && !!latErr}
              readOnly={isLocked || isUnavailable || !isManual}
              aria-disabled={isUnavailable}
              className={[
                "w-full max-w-[14ch] font-mono tabular-nums rounded-lg border px-2 py-1 bg-black/40 border-white/20",
                isUnavailable && "pointer-events-none cursor-not-allowed bg-black/20 text-white/75",
                isLocked && "cursor-not-allowed bg-black/30",
                isManual && latErr ? "border-red-500" : ""
              ].join(" ")}
            />
            <div className="mt-1 h-4 leading-4 text-[11px] text-gray-400">
              <span className="block">Requise</span>
            </div>
          </div>

          {/* Longitude */}
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">Longitude (°)</label>
            <input
              type="text"
              inputMode="decimal"
              maxLength={10}
              placeholder="2.35222"
              value={lon}
              onChange={(e)=>setLonSafe(e.target.value)}
              aria-invalid={isManual && !!lonErr}
              readOnly={isLocked || isUnavailable || !isManual}
              aria-disabled={isUnavailable}
              className={[
                "w-full max-w-[14ch] font-mono tabular-nums rounded-lg border px-2 py-1 bg-black/40 border-white/20",
                isUnavailable && "pointer-events-none cursor-not-allowed bg-black/20 text-white/75",
                isLocked && "cursor-not-allowed bg-black/30",
                isManual && lonErr ? "border-red-500" : ""
              ].join(" ")}
            />
            <div className="mt-1 h-4 leading-4 text-[11px] text-gray-400">
              <span className="block">Requise</span>
            </div>
          </div>

          {/* Altitude */}
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">Altitude (m)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              pattern="^-?\d{0,9}$"
              placeholder="35"
              value={alt}
              onChange={(e)=>setAltSafe(e.target.value)}
              aria-invalid={isManual && !!altErr}
              readOnly={isLocked || isUnavailable || !isManual}
              aria-disabled={isUnavailable}
              className={[
                "w-full max-w-[14ch] font-mono tabular-nums rounded-lg border px-2 py-1 bg-black/40 border-white/20",
                isUnavailable && "pointer-events-none cursor-not-allowed bg-black/20 text-white/75",
                isLocked && "cursor-not-allowed bg-black/30",
                isManual && altErr ? "border-red-500" : ""
              ].join(" ")}
            />
            <div className="mt-1 h-4 leading-4 text-[11px] text-gray-400">
              <span className="block">Optionnelle</span>
            </div>
          </div>
        </div>

        {/* Pavé messages (hauteur figée) */}
        <div className="mt-1 grid gap-1 min-w-0" style={{ height: 150 }}>
          <div className="h-5 leading-5 text-[11px] text-red-400 min-w-0">
            <span className={(isManual && !!latErr) ? "block truncate" : "invisible block"}>
              {latErr || "placeholder"}
            </span>
          </div>
          <div className="h-5 leading-5 text-[11px] text-red-400 min-w-0">
            <span className={(isManual && !!lonErr) ? "block truncate" : "invisible block"}>
              {lonErr || "placeholder"}
            </span>
          </div>
          <div className="h-5 leading-5 text-[11px] text-red-400 min-w-0">
            <span className={(isManual && !!altErr) ? "block truncate" : "invisible block"}>
              {altErr || "placeholder"}
            </span>
          </div>
          <div className="h-5 leading-5 text-[11px] text-gray-400 min-w-0">
            <span className={isManual ? "block truncate" : "invisible block"}>
              Astuce : tu peux saisir les décimales avec une virgule ou un point.
            </span>
          </div>
          <div className="h-5 leading-5 text-[11px] text-gray-400 min-w-0">
            <span className={
              (geoSource === "browser" && hasBrowser) || (geoSource === "exif" && hasExif)
                ? "block truncate" : "invisible block"
            }>
              {geoSource === "browser"
                ? "Coordonnées auto-remplies depuis l’appareil (verrouillées)."
                : geoSource === "exif"
                ? "Coordonnées auto-remplies depuis l’EXIF (verrouillées)."
                : "placeholder"}
            </span>
          </div>
          <div className="h-5 leading-5 text-[12px] text-amber-300/90 min-w-0" aria-live="polite">
            <span className="block truncate">
              {isManual && (!lat.trim() || !lon.trim())
                ? "Complète latitude et longitude pour activer l’export."
                : isManual && (latErr || lonErr || altErr)
                ? "Corrige les valeurs invalides (bornes ou format)."
                : "\u00A0"}
            </span>
          </div>
          <div className="h-5 leading-5" aria-hidden="true">
            <span className="invisible">spacer</span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block mb-1 font-semibold">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            maxLength={noteMaxLength}
            placeholder="Observations de terrain, contexte, tests (acide, Mohs), etc."
            className="w-full resize-y rounded-lg border border-white/20 bg-black/40 p-2"
          />
          <div className="text-xs text-gray-400 mt-1">
            {notes.length}/{noteMaxLength}
          </div>
        </div>

        {/* Actions, centrées + ligne d’aide figée */}
        <div className="mt-4 flex flex-wrap justify-center gap-6">
          <div className="inline-flex flex-col items-center w-[320px]">
            <ImageButton
              src="/ui/btn-full.png"
              label={exporting ? "Export…" : "Exporter le PDF"}
              onClick={onExportClick}
              fluid
              minWidth={220}
              maxWidth={360}
              aspect={3.2}
              hoverEffect={false}
              // @ts-ignore
              disabled={!canExportNow || exporting}
            />
            <div className="mt-2 h-5 leading-5 text-xs text-white/70 text-center w-full">
              <span className={!canExportNow ? "inline-block" : "invisible"}>
                L’export s’active quand une prédiction est disponible.
              </span>
            </div>
          </div>

          <div className="inline-flex flex-col items-center w-[320px]">
            <ImageButton
              src="/ui/btn-full.png"
              label="Accueil"
              onClick={()=>navigate("/identification")}
              fluid
              minWidth={220}
              maxWidth={360}
              aspect={3.2}
              hoverEffect={false}
            />
            <div className="h-5" aria-hidden="true" />
          </div>
        </div>
      </section>
    </main>
  );
}
export default ExportPage
