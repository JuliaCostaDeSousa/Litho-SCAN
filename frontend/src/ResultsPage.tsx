import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { TransferStore } from "./lib/transfer";
type NavStateResults = { file?: Blob } | null;

function ResultsPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: NavStateResults };
  const [file, setFile] = useState<Blob | null>(null);
	const [preview, setPreview] = useState<string>();

  useEffect(() => {
    // 1) d’abord via state ; 2) sinon via le stash en secours
    const fromState = state?.file ?? null;;
    const fromStash = TransferStore.take();
    const found = fromState ?? fromStash ?? null;

    if (!found) {
      navigate("/", { replace: true, state: null });
      return;
    }
    setFile(found);
  }, [state, navigate]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file) return <p>Redirection…</p>;

  return (
    <>
      <p>Resultats en attente</p>
      {preview && <img src={preview} alt="Aperçu résultat" style={{maxWidth: 240}} />}
    </>
  )
}

export default ResultsPage