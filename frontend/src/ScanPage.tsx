import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { TransferStore } from "./lib/transfer";
import { predict } from './services/inference/InferenceService';
import type { GeoPoint } from "./types/observation";
import FramedPreview from "./components/ui/FramedPreview";
import ImageButton from "./components/ui/ImageMaskedButton";

type NavStateScanPage = { file: Blob; exifGeo?: GeoPoint } | null;

const FRAME_SIZE = 224;    // cohérent avec / et /confirm
const FRAME_PADDING = 8;   // marge intérieure du cadre
const STATUS_H = 72;       // réserve d’espace pour le message

const nextPaint = () =>
  new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const id = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(id); reject(new DOMException("Aborted","AbortError")); };
    signal.addEventListener('abort', onAbort, { once: true });
  });

function ScanPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: NavStateScanPage };
  const [file, setFile] = useState<Blob | null>(null);
  const [error, setError] = useState<string|null>(null);
  const [preview, setPreview] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const didNav = useRef(false);

  // 1) Récupération du fichier (state prioritaire, sinon stash)
  useEffect(() => {
    const fromState = state?.file ?? null;
    const fromStash = TransferStore.take();
    const found = fromState ?? fromStash ?? null;

    if (!found) {
      navigate("/identification", { replace: true, state: null });
      return;
    }
    setFile(found);
  }, [state, navigate]);

  // 2) Preview locale blob
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 3) Lancement analyse + progression animée
  useEffect(() => {
    if (!file) return;
    prepareAnalysis(file);
    return () => abortRef.current?.abort();
  }, [file]);

  function annulerScan() {
    abortRef.current?.abort();
    navigate('/identification', { replace: true, state: null });
  }

  function goAccueil() {
    navigate('/identification', { replace: true, state: null });
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
    const t0 = performance.now();
    // petit check de décodage pour valider le blob
    const bmp = await createImageBitmap(file).catch(() => { throw new Error("Impossible de décoder l'image."); });
    bmp.close();
    setProgress(10);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // abort-race
    let abortHandler: (() => void) | null = null;
    const raceAbort = new Promise<never>((_, rej) => {
      abortHandler = () => rej(new DOMException("Aborted", "AbortError"));
      signal.addEventListener('abort', abortHandler, { once: true });
    });

    // animation de progression (cosmétique)
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
      anim = false;
      setProgress(100);

      await nextPaint(); // 1er cycle jusqu'à 100 %
      // si cycle hyper rapide, on relance un sleep
      const elapsed = performance.now() - t0;
      const MIN_TOTAL = 900; // ms you want the screen to be visible at least
      const remaining = Math.max(0, MIN_TOTAL - elapsed);
      await abortableSleep(remaining, signal);
      
      // vers /results
      TransferStore.set(file);
      if (!didNav.current) {
        didNav.current = true;
        navigate("/results", { state: { from: "scan", result, file, exifGeo: state?.exifGeo } });
      }
    } finally {
      anim = false;
      if (abortHandler) signal.removeEventListener('abort', abortHandler);
    }
  }

  if (!file) return <p className="text-white text-center">Redirection…</p>;

  return (
    <section className="mx-auto max-w-md px-4 py-8 text-center text-white">
      {/* Zone de preview cadrée (fixe, pas de layout-shift) */}
      <div className="w-full flex justify-center place-items-center">
        <FramedPreview
          size={FRAME_SIZE}
          innerPadding={FRAME_PADDING}
          frameSrc="/ui/frame-224.png"
          frameZ="above"
          imgSrc={preview} // la photo s’affiche pendant l’analyse
          alt="Photo à scanner"
        />
      </div>

      {/* Zone statut fixe */}
      <div
        className="mx-auto w-full grid place-items-center mt-4"
        style={{ height: STATUS_H }}
        aria-live="polite"
      >
        {loading ? (
          <div className="text-white/90">Analyse en cours… {progress}%</div>
        ) : error ? (
          <div className="text-red-300">
            Erreur : {error}{" "}
            <button
              type="button"
              onClick={reessayerScan}
              className="underline decoration-dotted underline-offset-4 hover:opacity-90"
            >
              Réessayer
            </button>
          </div>
        ) : (
          <div className="text-white/90">Prêt ✅</div>
        )}
      </div>

      {/* Boutons principaux en image */}
      <div className="space-y-3">
        <div className="w-full max-w-[360px] mx-auto">
          <ImageButton
            src="/ui/btn-full.png"
            label="Annuler"
            onClick={annulerScan}
            fluid
            minWidth={220}
            maxWidth={360}
            aspect={3.2}
            hoverEffect={false}
          />
        </div>
        <div className="w-full max-w-[360px] mx-auto">
          <ImageButton
            src="/ui/btn-full.png"
            label="Accueil"
            onClick={goAccueil}
            fluid
            minWidth={220}
            maxWidth={360}
            aspect={3.2}
            hoverEffect={false}
          />
        </div>
      </div>
    </section>
  );
}

export default ScanPage;
