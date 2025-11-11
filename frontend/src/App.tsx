import React, { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom';
import './App.css'
import { TransferStore } from "./lib/transfer";
import { getMetadata } from './services/gps/ExifReader';
import { imagenetCenterCrop224, makeObjectUrl } from "./utils/imagenet";
import ImageButton from "./components/ui/ImageMaskedButton"; // ton bouton visuel
import FramedPreview from "./components/ui/FramedPreview";

function CameraModal({
  onShot,
  onClose,
  onFallback,
}: {
  onShot: (blob: Blob) => void;
  onClose: () => void;
  onFallback?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | undefined;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width:  { ideal: 1280, max: 1920 },
            height: { ideal: 720,  max: 1080 },
            // aspectRatio: 16/9, // optionnel
          },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        const track = stream.getVideoTracks()[0];
          await track.applyConstraints?.({
            width:  { ideal: 224, max: 224 },
            height: { ideal: 224,  max: 224 },
            // resizeMode: "crop-and-scale" // (pas partout supporté)
          });
      } catch (e: any) {
        if (e?.name === "NotAllowedError") {
          setErr("Accès à la caméra refusé.");
          return;
        }
        setErr("Caméra indisponible.");
      }
    })();

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [onClose, onFallback]);

  async function takeShot() {
    const video = videoRef.current!;
    if (!video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob((b) => b && onShot(b), "image/jpeg", 0.92);
  }

return (
  <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
    <div className="bg-transparent rounded-2xl p-4 w-full max-w-md grid gap-3">
      <h2 className="text-lg font-semibold">Prendre une photo</h2>

      {err ? (
        <div className="space-y-2">
          <p className="text-red-600">{err}</p>
          <ul className="text-sm text-gray-600 list-disc pl-5">
            <li><b>Chrome/Android</b> : icône cadenas → Autorisations → Caméra → Autoriser.</li>
            <li><b>iPhone (Safari)</b> : Réglages iOS → Safari → Appareil photo → Autoriser, puis recharge la page.</li>
          </ul>
        </div>
      ) : (
        <video ref={videoRef} autoPlay playsInline className="w-full rounded-none bg-black rounded-none" style={{ borderRadius: 0 }} />
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-200">Fermer</button>
        {err && onFallback && (
          <button onClick={onFallback} className="px-4 py-2 rounded-xl bg-gray-100">
           Mode natif
          </button>
        )}
        {!err && (
          <button onClick={takeShot} className="px-4 py-2 rounded-xl bg-blue-600 text-white">
            Capturer
          </button>
        )}
      </div>
    </div>
  </div>
  );
}

function App() {
  const navigate = useNavigate();
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState<string|null>(null)

  // Fallback input refs (pour mobile / cas non supportés)
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function takePhoto() {
    const state = await getCameraPermissionState(); // 'granted' | 'prompt' | 'denied' | 'unknown'
    // Si la caméra est supportée (desktop ou mobile), on essaie le mode natif
    if (state === 'granted' || state === 'prompt' || state === 'unknown') {
      setShowCamera(true);          // modal caméra (desktop + mobiles supportés)
    } else {
      setError("Accès caméra refusé. Autorise la caméra dans les réglages du navigateur.");
      cameraRef.current?.click();   // fallback très vieux devices
    }
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  async function getCameraPermissionState(): Promise<'granted'|'prompt'|'denied'|'unknown'> {
    try {
      const perm = await (navigator as any).permissions?.query({ name: 'camera' as PermissionName });
      return perm?.state ?? 'unknown';
    } catch {
      return 'unknown'; // Safari iOS ne supporte pas toujours
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    await processPickedFile(file);
    try { input.value = ""; } catch {}
  }

  function handleShot(blob: Blob) {
    setShowCamera(false);
    TransferStore.set(blob);
    navigate("/confirm", { state: { file: blob } });
  }

    // Logique commune de traitement (valide + nav)
  async function processPickedFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return;
    
    // 1) EXIF (sur le File original)
    const exifGeo = await getMetadata(file); // GeoPoint | null
    const cropped224 = await imagenetCenterCrop224(file);
    const preview = await makeObjectUrl(cropped224);     // preview instantanée

    // 3) Conserver le File original pour la suite (analyse / export)
    TransferStore.set(file);
    
    // 4) Passer l’info EXIF à la page suivante
    navigate("/confirm", { state: { preview, exifGeo } }); // on gère la revoke côté /confirm
  }

  const FRAME_SIZE = 224;   // même cadre que FramedPreview
  const STATUS_H   = 80;    // même hauteur réservée pour messages
  const FRAME_PADDING = 0;
  return (
    <>
      <section className="mx-auto max-w-md px-4 py-8 text-center space-y-4 ">
        {/* PreviewArea — même gabarit que /confirm, imgSrc vide = juste le cadre */}
        <div className="w-full flex justify-center">
          <FramedPreview
            size={FRAME_SIZE}           // ex: 224
            innerPadding={FRAME_PADDING} // ex: 8 (doit matcher /confirm)
            frameSrc="/ui/frame-224.png"
            frameZ="above"              // le cadre passe bien au-dessus du logo
            placeholder={
              <div className="w-full h-full grid place-items-center p-2">
                <img
                  src="/ui/logo.png"
                  alt="Litho-SCAN"
                  className="w-full h-full object-contain scale-130"
                  draggable={false}
                />
              </div>
            }
          />
        </div>

      {/* StatusArea — même hauteur fixe pour éviter tout décalage (tu peux laisser vide) */}
      <div
        className="mx-auto w-full grid place-items-center"
        style={{ height: STATUS_H }}
        aria-live="polite"
      >
        {error ? (
          <p role="alert" className="text-red-500 text-sm">{error}</p>
        ) : (
          <div className="h-0" />
        )}
      </div>

      {/* Boutons — mêmes dimensions / spacing que /confirm */}
      <div className="space-y-3">
        {/* Importer */}
        <div className="inline-block">
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            onChange={onFileSelected}
            className="sr-only"
          />
          <ImageButton
            src="/ui/btn-full.png"
            label="Importer photo"
            onClick={() => galleryRef.current?.click()}
            width={320}
            height={100}
            hoverEffect={false}
          />
        </div>

        {/* Prendre une photo */}
        <div className="inline-block">
          <ImageButton
            src="/ui/btn-full.png"
            label="Prendre Photo"
            onClick={takePhoto}
            width={320}
            height={100}
            hoverEffect={false}
          />
        </div>
      </div>
    </section>

    {/* Modal caméra inchangé */}
    {showCamera && (
      <CameraModal
        onShot={handleShot}
        onClose={() => setShowCamera(false)}
        onFallback={isIOS ? () => cameraRef.current?.click() : undefined}
      />
    )}
  </>
);
}
export default App;
