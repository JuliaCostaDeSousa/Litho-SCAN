import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { TransferStore } from "./lib/transfer";
import { predict } from './services/inference/InferenceService';
import type { GeoPoint } from "./types/observation";
import SquarePreview from "./components/SquarePreview"

type NavStateScanPage = { file: Blob; exifGeo?: GeoPoint } | null;

function ScanPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: NavStateScanPage };
  const [file, setFile] = useState<Blob | null>(null);
  const [error, setError] = useState<string|null>(null);
  const [preview, setPreview] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

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
    if (!file) return;
    prepareAnalysis(file);
    return () => abortRef.current?.abort();
  }, [file]);

  if (!file) {
    return <p>Redirection…</p>;
  }

  function annulerScan() {
    abortRef.current?.abort();
    navigate('/', { replace: true, state: null });
  }

  function reessayerScan() {    
		if (!file) return;
    abortRef.current?.abort();
    prepareAnalysis(file);
  }

  function prepareAnalysis(blob: Blob) {
    if (!blob) return;
    setLoading(true);
    setError(null);
    setProgress(0);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    (async () => {
      try {
        await launchAnalysis(blob, signal);
      } catch (e: any) {
        if (e?.name !== "AbortError") setError("Une erreur est survenue pendant l’analyse.");
      } finally {
        setLoading(false);
      }
    })();
	}

  async function launchAnalysis(file: Blob, signal: AbortSignal) {
    // Exemple: décoder une bitmap (utile pour vérifier la lisibilité du blob)
    // Tip: createImageBitmap respecte souvent mieux les blobs que <img> sur Android
    const bmp = await createImageBitmap(file).catch(() => { throw new Error("Impossible de décoder l'image."); });
    bmp.close(); // on n’en a pas besoin plus longtemps
    setProgress(10);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    // Progression simulée (remplace par ton vrai algo / upload / worker…)

    // (on "race" entre predict et l'abort)
    let abortHandler: (() => void) | null = null;
    const raceAbort = new Promise<never>((_, rej) => {
      abortHandler = () => rej(new DOMException("Aborted", "AbortError"));
      signal.addEventListener('abort', abortHandler, { once: true });
      });
    // animation entre 10 et 95%
    let anim = true;
    (async () => {
      while (anim && !signal.aborted) {
        await new Promise(r => setTimeout(r, 120));
        setProgress(p => Math.min(95, p + 2));
      }
    })();
    try {
      const result = await Promise.race([predict(file), raceAbort]);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      anim = false
      setProgress(100);
      TransferStore.set(file);
      navigate("/results", { state: { from: "scan", result, exifGeo: state?.exifGeo } });
    } finally {
      //clean
      anim = false;
      if (abortHandler) signal.removeEventListener('abort', abortHandler);
    }
  } 

  if (!file) return <p>Redirection…</p>;

	return (
		<>
			{preview && (
        <SquarePreview
        src={preview}
        alt="Photo à scanner"
        size={224}
        fit="cover"         // crop centré, uniformisé style ImageNet
        decoding="async"
        loading="eager"
        />
			)}

			<div className="mt-3">
				{loading ? (
					<div>Analyse en cours… {progress}%</div>
				) : error ? (
					<div className="text-red-600">Erreur : {error}</div>
				) : (
					<div>Prêt ✅</div>
				)}
			</div>

			<div className="mb-3 flex gap-8">
				<button className="button-annulerScan" onClick={annulerScan} type="button">
					Annuler
				</button>
				<button
					className="button-reessayerScan"
					onClick={reessayerScan}
					type="button"
					disabled={loading || !error}
				>
					Réessayer
				</button>
			</div>
		</>
	);
}

export default ScanPage