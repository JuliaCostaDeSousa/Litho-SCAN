import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { TransferStore } from "./lib/transfer";
type NavStateScanPage = { file?: Blob} | null;

function ScanPage() {
  const navigate = useNavigate();
	const { state } = useLocation() as { state: NavStateScanPage };
  const [file, setFile] = useState<Blob | null>(null);
  const [error, setError] = useState<string|null>(null)
	const [preview, setPreview] = useState<string>();
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
    // 1) d’abord via state ; 2) sinon via le stash en secours
    const fromState = state?.file ?? null;;
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
        // petite pause pour laisser peindre "100%"
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 200));
        if (!signal.aborted) {
          TransferStore.set(blob);
          navigate("/results", { state: { from: "scan" } });
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setError("Une erreur est survenue pendant l’analyse.");
      } finally {
        setLoading(false);
      }
    })();
	}

  // Exemple d’analyse “fake” avec progression + respect d’abort
  async function launchAnalysis(file: Blob, signal: AbortSignal) {
    // Exemple: décoder une bitmap (utile pour vérifier la lisibilité du blob)
    // Tip: createImageBitmap respecte souvent mieux les blobs que <img> sur Android
    const bmp = await createImageBitmap(file).catch(() => { throw new Error("Impossible de décoder l'image."); });
    bmp.close(); // on n’en a pas besoin plus longtemps

    // Progression simulée (remplace par ton vrai algo / upload / worker…)

		for (let i = 1; i <= 20; i++) {
			if (signal.aborted) throw new DOMException("Aborted", "AbortError");
			await new Promise(r => setTimeout(r, 80));
			const pct = Math.round((i / 20) * 100);
			setProgress(pct);
		}
  }

  if (!file) return <p>Redirection…</p>;

	return (
		<>
			{preview && (
				<img
					src={preview}
					alt="Photo à scanner"
					style={{ maxWidth: 220, height: "auto" }}
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