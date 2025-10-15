import React, { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom';
import './App.css'
import { TransferStore } from "./lib/transfer";

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
          video: { facingMode: "environment" },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
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
    <div className="bg-white rounded-2xl p-4 w-full max-w-md grid gap-3">
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
        <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black" />
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

    const preview = URL.createObjectURL(file);     // preview instantanée
    navigate("/confirm", { state: { preview } });  // tu gères la revoke côté /confirm
  }

  // Tente l’API moderne (Chrome/Android, Desktop Chrome/Edge…)
  async function pickImage() {
    // @ts-ignore: API expérimentale selon TS
    if (!window.showOpenFilePicker) throw new Error("FSA not supported");

    // @ts-ignore
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: "Images",
        accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".avif"] }
      }],
      excludeAcceptAllOption: false,
    });
    const file: File = await handle.getFile();
    await processPickedFile(file);
  }

  async function onClickImport() {
    try {
      // essaie d’abord l’API moderne (souvent plus fiable avec Google Photos / cloud)
      // @ts-ignore
      if (window.showOpenFilePicker) {
        await pickImage();
        return;
      }
    } catch (err) {
      console.warn("pickImage failed, fallback to input:", err);
    }
    // fallback universel
    galleryRef.current?.click();
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-red-600 font-medium mb-3">
          {error}
        </p>
      )}
      {/* Importer (overlay input) */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          className="button-importPhoto"
          onClick={onClickImport}>
          Importer photo
        </button>
         <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          onChange={onFileSelected}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
            WebkitAppearance: "none",
            appearance: "none",
            zIndex: 10,
          }}
        />
      </div>
      {/* Prendre une photo (desktop: getUserMedia, mobile: fallback input capture) */}
      <div style={{ position:'relative', display:'inline-block', marginTop:12 }}>
        <button
          type="button"
          className="button-takePhoto"
          onClick={takePhoto}
        >
          Prendre Photo
        </button>

        {isIOS && (
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFileSelected}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0, cursor:'pointer', WebkitAppearance:'none', appearance:'none', zIndex:10 }}
          />
        )}
      </div>
      {showCamera && (
        <CameraModal
          onShot={handleShot}
          onClose={() => setShowCamera(false)}
          onFallback={isIOS ? () => cameraRef.current?.click() : undefined}
        />
      )}
    </>
  )
}

export default App
