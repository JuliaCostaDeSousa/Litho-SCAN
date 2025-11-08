import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { TransferStore } from "./lib/transfer";
import type { GeoPoint } from "./types/observation";

type NavStateScanMenu = { preview?: string; file?: Blob; exifGeo?: GeoPoint } | null;

function ScanMenu() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state?: NavStateScanMenu };
  const initialUrl = state?.preview;
  const initialFile = state?.file;

  const [src, setSrc] = useState<string | undefined>(initialUrl);
  const [err, setErr] = useState<string | null>(null);
  const [readyBlob, setReadyBlob] = useState<Blob | null>(null);

  const [tries, setTries] = useState(0);

  // Si pas d’URL → retour à l’accueil
  useEffect(() => {
    if (!initialUrl && !initialFile) navigate("/", { replace: true, state: null });
  }, [initialUrl, initialFile, navigate]);

  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialFile) return;
    setReadyBlob(initialFile);

    const next = URL.createObjectURL(initialFile);

    // révoque l'ancienne si présente
    if (lastUrlRef.current && lastUrlRef.current !== next) {
        URL.revokeObjectURL(lastUrlRef.current);
      }
      lastUrlRef.current = next;
      setSrc(next);
  }, [initialFile]);

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
      if (lastUrlRef.current && lastUrlRef.current !== src) {
        URL.revokeObjectURL(lastUrlRef.current);
      }
    };
  }, [src]);

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

      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/jpeg", 0.92)
      );
      setReadyBlob(blob);           // Blob prêt pour /scan
    } catch (e) {
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
        {src ? (
          <img
            key={tries}
            src={src}
            alt="Aperçu"
            style={{ maxWidth: 220, height: "auto" }}
            decoding="async"
            loading="eager"
            onLoad={initialFile ? undefined : handleLoad}   // ⬅️ pas de re-encode si file
            onError={() => {
              setReadyBlob(null);
              setErr("Impossible de charger l’aperçu depuis la galerie.");
            }}
          />
        ) : (
          <div>Pas d’aperçu</div>
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
        <div className="text-sm text-gray-500">Chargement de l’aperçu…</div>
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
        >
          Débuter Scan
        </button>
      </div>
    </>
  );
}
export default ScanMenu
