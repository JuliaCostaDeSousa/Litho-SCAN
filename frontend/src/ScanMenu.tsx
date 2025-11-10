import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { TransferStore } from "./lib/transfer";
import type { GeoPoint } from "./types/observation";
import SquarePreview from "./components/SquarePreview"
import { imagenetCenterCrop224, makeObjectUrl } from "./utils/imagenet";

type NavStateScanMenu = { preview?: string; file?: Blob; exifGeo?: GeoPoint } | null;

function ScanMenu() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state?: NavStateScanMenu };
  const initialUrl = state?.preview;
  const initialFile = state?.file;
  const [previewModelUrl, setPreviewModelUrl] = useState<string>();
  const [src, setSrc] = useState<string | undefined>(initialUrl);
  const [err, setErr] = useState<string | null>(null);
  const [readyBlob, setReadyBlob] = useState<Blob | null>(null);
  const [tries, setTries] = useState(0);
  const showUrl = initialFile ? previewModelUrl : src;

  useEffect(() => {
    if (!initialUrl && !initialFile) {
      navigate("/", { replace: true, state: null });
    }
  }, [initialUrl, initialFile, navigate]);

  useEffect(() => {
    if (!initialFile) return;
    let revokeModel: string | undefined;
    let cancelled = false;

    (async () => {
      try {
        const croppedBlob = await imagenetCenterCrop224(initialFile);
        if (cancelled) return;
        const modelUrl = await makeObjectUrl(croppedBlob);
        if (cancelled) return;
        revokeModel = modelUrl;
        setPreviewModelUrl(modelUrl);
        setReadyBlob(croppedBlob);
      } catch {
        if (!cancelled) {
          setErr("Impossible de préparer l’aperçu (crop 224×224).");
          setReadyBlob(null);
        }
      }
    })();

    return () => { cancelled = true; if (revokeModel) URL.revokeObjectURL(revokeModel); };
  }, [initialFile]);

  useEffect(() => {
    if (previewModelUrl) setErr(null);
  }, [previewModelUrl]);

  // Quand l’image a VRAIMENT chargé, re-encode en JPEG pour obtenir un Blob stable
  async function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    setErr(null);
    setTries(0);
    try {
      const img = e.currentTarget;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const originalBlob: Blob = await new Promise((res, rej) =>
        canvas.toBlob(b => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.92)
      );

      // aligne avec ImageNet
      const cropped = await imagenetCenterCrop224(originalBlob);
      setReadyBlob(cropped);

      // (optionnel) montrer aussi l’aperçu modèle si tu n’as pas initialFile
      const modelUrl = URL.createObjectURL(cropped);
      setPreviewModelUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return modelUrl;
      });
    } catch {
      setErr("Impossible de préparer l’aperçu (re-encodage)");
      setReadyBlob(null);
    }
  }

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Si certains pickers mettent du temps → bouton “Réessayer” force un nouveau cycle de rendu
  function manualRetry() {
    if (!src || initialFile) return; // si initialFile existe, inutile de “réessayer” un blob déjà OK
    setErr(null);
    setTries(t => t + 1);
    // astuce: on “décroche” puis on ré-assigne pour forcer <img> à recharger
    const saved = src;
    setSrc(undefined);
    setTimeout(() => {
      if (mountedRef.current) setSrc(saved);
    }, 50);
  }


  function debuterScan() {
    if (!readyBlob) return;
    TransferStore.set(readyBlob);
    navigate("/scan", { state: { file: readyBlob, exifGeo: state?.exifGeo } });
  }

  function goAccueil() {
    navigate("/", { replace: true, state: null });
  }

  return (
    <>
      <div>
        {showUrl ? (
          <SquarePreview
            key={tries}
            src={showUrl}
            alt="Aperçu (entrée modèle)"
            size={224}
            fit="cover"
            decoding="async"
            loading="eager"
            onLoad={initialFile ? undefined : handleLoad} // only when pas de file
            onError={() => {
              setReadyBlob(null);
              setErr("Impossible de charger l’aperçu.");
            }}
          />
        ) : (
          <div className="w-[224px] h-[224px] rounded-xl bg-gray-800/40 grid place-items-center text-xs text-gray-400">
            Aperçu en préparation…
          </div>
        )}
      </div>

      {err ? (
        <div className="mt-2 text-red-600 text-sm">
          {err}
          <div className="mt-2 flex gap-8">
            <button onClick={manualRetry} className="px-3 py-1 rounded bg-gray-200">
              Réessayer
            </button>
            <button onClick={goAccueil} className="px-3 py-1 rounded bg-gray-200">
              Revenir
            </button>
          </div>
          <p className="mt-2 text-gray-600 text-xs">
            Astuce : choisis la photo via <b>Fichiers/Stockage</b> plutôt que via l’app “Photos”.
          </p>
        </div>
      ) : tries > 0 ? (
        <div
          className="w-[224px] h-[224px] rounded-xl bg-gray-800/40 grid place-items-center text-xs text-gray-400 animate-pulse"
          aria-live="polite"
        >
          Aperçu en préparation…
        </div>
      ) : null}

      <div className="mt-3 flex gap-8">
        <button type="button" className="button-accueil" onClick={goAccueil}>
          Accueil
        </button>
        <button
          type="button"
          className="button-debuterScan"
          onClick={debuterScan}
          disabled={!readyBlob}
          aria-busy={!readyBlob}
          title={!readyBlob ? "Préparation de l’aperçu 224×224 en cours…" : undefined}
        >
          Débuter Scan
        </button>
      </div>
    </>
  );
}
export default ScanMenu
