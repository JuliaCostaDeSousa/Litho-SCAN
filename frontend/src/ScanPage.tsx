import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
type NavStateScan = { file: File };

function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [preview, setPreview] = useState<string | undefined>();
  const nav = location.state as NavStateScan | null;
  const file = nav?.file;
  const [error, setError] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const abortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    if (!file) return;
    prepareAnalysis();
    return () => abortRef.current?.abort();
  }, [file]);

  if (!nav) {
    return <p>Redirection…</p>;
  }

  function annulerScan() {
    abortRef.current?.abort();
    navigate("/", { replace: true });
  }

  function reessayerScan() {
    abortRef.current?.abort();
    prepareAnalysis();
  }

  function prepareAnalysis() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setProgress(0);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    launchAnalysis(file, signal);
  }

  async function launchAnalysis(file: File, signal: AbortSignal) {
    try {
      if (signal.aborted) return

    } catch (err) {
      setLoading(false);
      throw new Error();
    }
  }


  return (
    <>
      <button className="button-annulerScan" onClick={annulerScan} aria-label="annuler Scan" type="button" disabled={!file || !preview}>
        Annuler Scan
        </button>
      <button className="button-reessayerScan" onClick={reessayerScan} aria-label="reessayer Scan" type="button" disabled={loading || !error}>
        Reessayer Scan
        </button>
      {preview && <img src={preview} alt="Photo à scanner" style={{maxWidth: 200, height: "auto"}}></img>}
    </>
  )
}
export default ScanPage
