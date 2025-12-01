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
    <div 
      className="border border-[#17BDCD] rounded-2xl p-4 w-full max-w-md grid gap-3"           
      style={{
              backgroundImage: "url('/ui/bg.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backdropFilter: "blur(2px)",
      }}>
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-lg text-white/90 font-semibold">Prendre une photo</h2>
        <button
            type="button"
            onClick={onClose}
            className="text-sm text-white/70 hover:text-white inline-flex items-center rounded-full border border-[#17BDCD] px-4 py-1"
          >
            Fermer
        </button>
      </div>
 
      {err ? (
        <div className="space-y-2">
          <p className="text-red-600">{err}</p>
          <ul className="text-sm text-gray-600 list-disc pl-5">
            <li><b>Chrome/Android</b> : icône cadenas → Autorisations → Caméra → Autoriser.</li>
            <li><b>iPhone (Safari)</b> : Réglages iOS → Safari → Appareil photo → Autoriser, puis recharge la page.</li>
          </ul>
        </div>
      ) : (
        <video ref={videoRef} autoPlay playsInline className="w-full rounded-none bg-black"/>
      )}

      <div className="flex gap-2 justify-end">      
        {err && onFallback && (
          <button onClick={onFallback} className="text-sm text-white/70 hover:text-white inline-flex items-center rounded-full border border-[#17BDCD] px-4 py-1">
           Mode natif
          </button>
        )}
        {!err && (
          <div className="w-full max-w-[200px] mx-auto">
            <ImageButton
              src="/ui/btn-full.png"
              label="Capturer"
              onClick={takeShot}
              fluid
              minWidth={220}
              maxWidth={360}
              aspect={3.2}
              hoverEffect={false}
            />
          </div>
        )}
      </div>
    </div>
  </div>
  );
}

const DEMO_SAMPLES = [
  { label: "Basalte", src: "/demo_samples/basalte_01.jpg" },
  { label: "Calcaire", src: "/demo_samples/calcaire_01.jpg" },
  { label: "Granite", src: "/demo_samples/granite_01.jpg" },
  { label: "Grès", src: "/demo_samples/gres_01.jpg" },
  { label: "Schiste", src: "/demo_samples/schiste_01.jpg" },
  { label: "Non reconnue", src: "/demo_samples/unknown_01.jpg" },
];

function PhotoPage() {
  const navigate = useNavigate();
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [showDemo, setShowDemo] = useState(false);

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
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setError("Fichier trop volumineux (> 20 Mo). Exporte la photo en JPEG/PNG depuis la galerie.");
      try { e.currentTarget.value = ""; } catch {}
      return;
    }

    const sniff = await sniffImageFormat(file);
    const looksSupported = ['png','jpeg','webp'].includes(sniff);

    if (!looksSupported) {
      // Parfois le sniff est "unknown" mais le navigateur sait décoder (mauvais MIME/headers tronqués).
      if (!(await canDecodeInBrowser(file))) {
        setError("Format non supporté sur ce navigateur. Exporte la photo en JPEG/PNG depuis la galerie.");
        try { e.currentTarget.value = ""; } catch {}
        return;
      }
    }
    await processPickedFile(file);
    try { input.value = ""; } catch {}
  }

  function handleShot(blob: Blob) {
    setShowCamera(false);
    TransferStore.set(blob);
    navigate("/confirm", { state: { file: blob } });
  }

  async function sniffImageFormat(file: File): Promise<'jpeg'|'png'|'webp'|'heic'|'unknown'> {
    const buf = await file.slice(0, 16).arrayBuffer();
    const b = new Uint8Array(buf);

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (b.length >= 8 && b[0]===0x89 && b[1]===0x50 && b[2]===0x4E && b[3]===0x47 &&
        b[4]===0x0D && b[5]===0x0A && b[6]===0x1A && b[7]===0x0A) return 'png';

    // JPEG: FF D8 FF
    if (b.length >= 3 && b[0]===0xFF && b[1]===0xD8 && b[2]===0xFF) return 'jpeg';

    // WebP: "RIFF" .... "WEBP"
    const text = new TextDecoder().decode(b);
    if (text.startsWith('RIFF') && text.includes('WEBP')) return 'webp';

    // HEIC/HEIF (approx): bytes 4..7 = 'ftyp' + brand 'heic', 'heix', 'mif1', ...
    if (text.slice(4,8) === 'ftyp') {
      const brand = text.slice(8,12);
      if (['heic','heix','hevc','hevx','mif1','msf1','heis','hevm'].includes(brand)) return 'heic';
    }
    return 'unknown';
  }

  async function canDecodeInBrowser(file: File): Promise<boolean> {
    try {
      if ('createImageBitmap' in window) {
        const bmp = await createImageBitmap(file);
        bmp.close?.();
        return true;
      }
    } catch {}
    // Fallback <img> + objectURL
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(true); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
      img.src = url;
    });
  }

  // Logique commune de traitement (valide + nav)
  async function processPickedFile(file: File) {
    try {
      // EXIF (ok si null)
      const exifGeo = await getMetadata(file);

      // ⚠️ protège le décodage/crop
      let cropped224: Blob;
      try {
        cropped224 = await imagenetCenterCrop224(file);
      } catch {
        setError("Impossible de préparer l’aperçu (format/codec). Exporte la photo en JPEG/PNG.");
        return;
      }

      const preview = await makeObjectUrl(cropped224);

      // Conserver l’original pour la suite
      TransferStore.set(file);

      navigate("/confirm", { state: { preview, exifGeo } });
    } catch {
      setError("Échec de l’import. Réessaie avec une photo en JPEG/PNG/WebP.");
    }
  }

  async function analyseImageFromUrl(src: string) {
    try {
      const res = await fetch(src);
      const blob = await res.blob();

      // On fabrique un "File" pour réutiliser processPickedFile
      const file = new File([blob], "demo_sample.jpg", {
        type: blob.type || "image/jpeg",
      });

      await processPickedFile(file);
    } catch (e) {
      console.error("Erreur chargement image de démo", e);
      setError("Impossible de charger l’image de démonstration.");
    }
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
      <div className="w-full max-w-[360px] mx-auto">
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          onChange={onFileSelected}
          className="sr-only"
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileSelected}
          className="sr-only"
        />
        {/* Importer */}
        <div className="w-full max-w-[360px] mx-auto">
          <ImageButton
            src="/ui/btn-full.png"
            label="Importer une photo"
            onClick={() => galleryRef.current?.click()}
            fluid
            minWidth={220}
            maxWidth={360}
            aspect={3.2}
            hoverEffect={false}
          />
        </div>

        {/* Prendre une photo */}
        <div className="w-full max-w-[360px] mx-auto">
          <ImageButton
            src="/ui/btn-full.png"
            label="Prendre une photo"
            onClick={takePhoto}
            fluid
            minWidth={220}
            maxWidth={360}
            aspect={3.2}
            hoverEffect={false}
          />
        </div>

        {/* Photo Demo */}
        <div className="w-full max-w-[360px] mx-auto">
          <ImageButton
            src="/ui/btn-full.png"
            label="Utiliser un exemple"
            onClick={() => setShowDemo((v) => !v)}
            fluid
            minWidth={220}
            maxWidth={360}
            aspect={3.2}
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

    {showDemo && (
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
        <div
          className="
            border border-[#17BDCD] rounded-2xl p-4 sm:p-5
            w-full
            max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl
            max-h-[80vh] overflow-y-auto
          "
          style={{
            backgroundImage: "url('/ui/bg.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backdropFilter: "blur(2px)",
          }}
        >
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-white">
              Choisir une image d’exemple
            </h2>
            <button
              type="button"
              onClick={() => setShowDemo(false)}
              className="text-sm text-white/70 hover:text-white inline-flex items-center rounded-full border border-[#17BDCD] px-4 py-1"
            >
              Fermer
            </button>
          </div>

          <p className="text-sm text-white/90 mb-3 sm:mb-4">
            Sélectionne une image pour tester le modèle sans fournir de photo personnelle.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {DEMO_SAMPLES.map((s) => (
              <button
                key={s.src}
                type="button"
                className="
                  p-2 rounded-xl border border-white/10 bg-black/30 cursor-pointer 
                  hover:border-[#17BDCD] 
                  hover:shadow-[0_0_12px_rgba(23,189,205,0.6)]
                  transition
                "
                onClick={() => {
                  setShowDemo(false);
                  analyseImageFromUrl(s.src);
                }}
              >
                <img
                  src={s.src}
                  alt={s.label}
                  className="rounded-lg w-full aspect-square object-cover"
                />
                <p className="text-center mt-2 text-white/90 text-sm">
                  {s.label}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
  </>
);
}
export default PhotoPage;
