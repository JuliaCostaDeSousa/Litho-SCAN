import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import './App.css'

function App() {
  const navigate = useNavigate();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string|null>(null)

  function importPhoto() {
    galleryRef.current?.click();
  }

  function takePhoto() {
    cameraRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null); // reset potential former error
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type ? file.type.startsWith("image/") : /\.(png|jpe?g|heic|webp)$/i.test(file.name);
    if (!isImage) {
      setError("Le fichier sélectionné n’est pas une image.");
      e.currentTarget.value = "";
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setError("L’image dépasse 10 Mo. Choisis-en une plus légère.");
      e.currentTarget.value = "";
      return;
    }

    navigate("/confirm", { state: { file } });
    e.currentTarget.value = "";
  }

  return (
    <>
      {error && (<p role="alert" className="error">{error}</p>)}
      <button className="button-importPhoto" onClick={importPhoto} aria-label="Importer une photo" type="button">
        Importer photo
        </button>
      <input
        type="file"
        accept="image/*"
        ref={galleryRef}
        onChange={onFileSelected}
        hidden
      />

      <button className="button-takePhoto" onClick={takePhoto} aria-label="Prendre une photo" type="button">
        Prendre Photo
        </button>
      <input
        type="file"
        accept="image/*"
        {...{ capture: "environment" }}
        ref={cameraRef}
        onChange={onFileSelected}
        hidden
      />
    </>
  )
}

export default App
