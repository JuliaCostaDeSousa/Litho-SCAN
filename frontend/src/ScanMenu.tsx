import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { TransferStore } from "./lib/transfer";
import type { GeoPoint } from "./types/observation";
import { imagenetCenterCrop224, makeObjectUrl } from "./utils/imagenet";
import ImageButton from "./components/ui/ImageMaskedButton";
import FramedPreview from "./components/ui/FramedPreview";

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
    navigate("/photo", { replace: true, state: null });
  }
  
  const FRAME_SIZE = 224;   // taille de ton cadre
  const STATUS_H   = 80;    // hauteur réservée pour erreur / "préparation..."

  return (
    <>
      <section className="mx-auto max-w-md px-4 py-8 text-center space-y-4">
        {/* PreviewArea — centré, hauteur fixe */}
        <div
          className="mx-auto grid place-items-center"
          style={{ height: FRAME_SIZE }}
        >
          <FramedPreview
            size={FRAME_SIZE}
            frameSrc="/ui/frame-224.png"
            imgSrc={showUrl}              // (undefined => placeholder interne)
            alt="Aperçu (entrée modèle)"
            onLoad={initialFile ? undefined : handleLoad}
            onError={() => {
              setReadyBlob(null);
              setErr("Impossible de charger l’aperçu.");
            }}
            frameZ="above"
            // innerPadding / rounded par défaut OK
          />
        </div>

        {/* StatusArea — hauteur fixe pour éviter tout shift */}
        <div
          className="mx-auto w-full grid place-items-center"
          style={{ height: STATUS_H }}
          aria-live="polite"
        >
          {err ? (
            <div className="max-w-sm w-full px-3 py-2 border border-red-500/30 text-red-200 bg-red-500/10 rounded-md text-sm">
              <div>{err}</div>
              <div className="mt-2 flex items-center justify-center gap-3">
                <ImageButton
                  src="/ui/btn-full.png"
                  label="Réessayer"
                  onClick={manualRetry}
                  fluid
                  minWidth={220}
                  maxWidth={360}
                  aspect={3.2}
                  hoverEffect={false}
                />
                <ImageButton
                  src="/ui/btn-full.png"
                  label="Revenir"
                  onClick={goAccueil}
                  fluid
                  minWidth={220}
                  maxWidth={360}
                  aspect={3.2}
                  hoverEffect={false}
                />
              </div>
              <p className="mt-2 text-[11px] text-red-200/80">
                Astuce : choisis la photo via <b>Fichiers/Stockage</b> plutôt que via l’app “Photos”.
              </p>
            </div>
          ) : tries > 0 ? (
            <div className="text-xs text-neutral-300 animate-pulse">
              Aperçu en préparation…
            </div>
          ) : (
            // placeholder vide pour garder la hauteur
            <div className="h-0" />
          )}
        </div>

        {/* Boutons principaux — ne bougent plus */}
        <div className="space-y-3">
          <div>
            <ImageButton
              src="/ui/btn-full.png"
              label="Débuter Scan"
              onClick={debuterScan}
              fluid
              minWidth={220}
              maxWidth={360}
              aspect={3.2}
              disabled={!readyBlob}
              hoverEffect={false}
            />
            {!readyBlob && (
              <p className="mt-2 text-xs text-neutral-300">
                Préparation de l’aperçu 224×224 en cours…
              </p>
            )}
          </div>

          <div>
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
    </>
  );
}
export default ScanMenu
