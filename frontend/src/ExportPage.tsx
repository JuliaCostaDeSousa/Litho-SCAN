import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
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
};

function ExportPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: ExportNavState };
  const [file, setFile] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [includeTopK, setIncludeTopK] = useState(false);
  const [includeCoords, setIncludeCoords] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [geoSource, setGeoSource] = useState<"none"|"browser"|"exif"|"manual">("none");
  const [geoLines, setGeoLines] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  
  useEffect(() => {
    const blob = TransferStore.take()
    const result = state?.exportResult;
    const geo = state?.geoCandidates;

    if (!blob || !result || result.abstained || !result.top1.label) {
      navigate("/", { replace: true });
      return;
    }

    setFile(blob);
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setIncludeTopK((result.alts?.length ?? 0) > 0);
    const hasAnyGeo = !!(geo && (geo.browser || geo.exif || geo.manual));
    setIncludeCoords(hasAnyGeo);
    setGeoSource(geo?.browser ? "browser" : geo?.exif ? "exif" : geo?.manual ? "manual" : "none");
    setGeoLines(geo?.browser ?? geo?.exif ?? geo?.manual ?? []);

    return () => { URL.revokeObjectURL(url); };
  }, []);

  const result = state?.exportResult;
  const canExportNow =
    !!file && !!result && !result.abstained && !!result.top1.label &&
    (!includeCoords || (geoSource !== "none" && geoLines.length > 0));
  
    
  function onGeoSourceChange(next: "none"|"browser"|"exif"|"manual") {
    setGeoSource(next);
    if (next === "none") {
      setGeoLines([]);
    } else {
      const g = state?.geoCandidates;
      setGeoLines(next === "browser" ? (g?.browser ?? []) :
                  next === "exif"   ? (g?.exif   ?? []) :
                  next === "manual" ? (g?.manual ?? []) : []);
    }
  }

  function toggleTopK() {
    setIncludeTopK(v => !v);
  }
  function toggleCoords() {
    setIncludeCoords(prev => {
      const next = !prev;
      if (!next) {            // on vient de décocher → reset
        setGeoSource("none");
        setGeoLines([]);
      }
      return next;
    });
  }
  function toggleNotes() {
    setIncludeNotes(v => !v); 
  }

  async function onExportClick() {
    if (!canExportNow || !file || !result) return;
    setExporting(true);
    try {
      const observation = {
        photo: file,
        result,
        when: new Date(),
        geo: (includeCoords && geoSource !== "none" && geoLines.length)
            ? { source: geoSource, coords: geoLines }
            : undefined,
        top1Rock: state.top1Rock
      };

      await exportObservation(
        observation,
        { toast: undefined }
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <main className="grid lg:grid-cols-2 gap-8">
      <aside>
        {previewUrl
        ? <SquarePreview src={previewUrl} alt="Aperçu photo" size={224} fit="cover" decoding="async" loading="eager" />
        : <div className="h-48 bg-gray-800/40 rounded-xl" />
        }

        <h2 className="mt-6 font-semibold">Ce qui sera inclus :</h2>
        <ul className="text-sm space-y-1 mt-2">
          <li>Photo (obligatoire)</li>
          <li>Top-1 (obligatoire)</li>
          {includeTopK && <li>Alternatives de prédiction</li>}
          {includeCoords && geoSource!=="none" && <li>Coordonnées ({geoSource})</li>}
          {includeNotes && <li>Notes</li>}
        </ul>
      </aside>

      <section>
        <h1 className="text-xl font-bold mb-4">Paramètres d’export</h1>

        <div className="space-y-2">
          <label><input type="checkbox" checked readOnly disabled /> Photo (obligatoire)</label><br/>
          <label><input type="checkbox" checked readOnly disabled /> Top-1 (obligatoire)</label><br/>
          <label><input type="checkbox" checked={includeTopK}  onChange={toggleTopK}  disabled={!result?.alts?.length}/> Alternatives de prédiction</label><br/>
          <label><input type="checkbox" checked={includeCoords} onChange={toggleCoords} disabled={!state?.geoCandidates}/> Coordonnées</label><br/>
          <label><input type="checkbox" checked={includeNotes} onChange={toggleNotes}/> Notes</label>
        </div>

        <div className="mt-4">
          <label className="block mb-1 font-semibold">Source de coordonnées</label>
          <select
            value={geoSource}
            onChange={(e)=>onGeoSourceChange(e.target.value as any)}
            disabled={!includeCoords || !state?.geoCandidates}
          >
            <option value="none">Aucune</option>
            {state?.geoCandidates?.browser && <option value="browser">Appareil (GPS)</option>}
            {state?.geoCandidates?.exif   && <option value="exif">EXIF</option>}
            {state?.geoCandidates?.manual && <option value="manual">Manuel</option>}
          </select>

          {includeCoords && geoSource!=="none" && (
            <div className="mt-2 text-sm">
              {geoLines.length ? geoLines.map((l,i)=><div key={i}>{l}</div>) : <em>Aucune donnée pour cette source</em>}
            </div>
          )}
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
            L’export s’active quand une prédiction Top-1 est dispo, et/ou quand la source de coordonnées choisie contient des lignes.
          </p>
        )}
      </section>
    </main>
  );
}

export default ExportPage