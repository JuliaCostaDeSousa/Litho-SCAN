import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
type NavStateScan = { file: File };

function ScanMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const [preview, setPreview] = useState<string | undefined>();
  const nav = location.state as NavStateScan | null;
  const file = nav?.file;

  useEffect(() => {
    if (!nav) {
      navigate("/", { replace: true });
    };
  }, [nav, navigate]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!nav) {
    return <p>Redirection…</p>;
  }

  function debuterScan() {
    if (!file) return;
    navigate("/scan", { state: { file } });
  }

  function goAccueil() {
    navigate("/", { replace: true });
  }

  return (
    <>
      <button className="button-debuterScan" onClick={debuterScan} aria-label="debuter Scan" type="button" disabled={!file || !preview}>
        Debuter Scan
        </button>
      <button className="button-accueil" onClick={goAccueil} aria-label="accueil" type="button">
        Accueil
        </button>
      {preview && <img src={preview} alt="Photo à scanner" style={{maxWidth: 200, height: "auto"}}></img>}
    </>
  )
}

export default ScanMenu
