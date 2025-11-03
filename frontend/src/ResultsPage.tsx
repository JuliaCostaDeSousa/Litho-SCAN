import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { TransferStore } from "./lib/transfer";
type PredictResult = {
  top3: { index: number; label: string; prob: number; percent: number }[];
  top1_label: string | null;
  top1_conf: number;   // 0..1
  abstained: boolean;
};
type NavStateResults = { from?: string; result?: PredictResult; file?: Blob } | null;

function ResultsPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: NavStateResults };
  const [file, setFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string>();
  const result = state?.result;

  useEffect(() => {
    // 1) d’abord via state ; 2) sinon via le stash en secours
    const fromState = state?.file ?? null;
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
      {preview && <img src={preview} alt="Aperçu résultat" style={{maxWidth: 240}} />}

      {!result ? (
        <p className="mt-3">Aucun résultat transmis. Reviens en arrière et relance un scan.</p>
      ) : (
        <div className="mt-4">
            <h2 className="text-lg font-semibold">
              {result.abstained
                  ? "Je ne sais pas 🤔"
                  : `${result.top1_label ?? '—'} — ${Math.round(result.top1_conf * 100)}%`}
            </h2>
            {!result.abstained && (
              <div style={{ marginTop: 8, width: 240, background: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  aria-label="Confiance top-1"
                  style={{
                    width: `${Math.round(result.top1_conf * 100)}%`,
                    height: 8,
                    background: '#16a34a'
                  }}
                />
              </div>
            )}
            <ul className="mt-2 space-y-1">
              {result.top3.map((t) => (
                <li key={t.index}>
                {t.label}: <strong>{t.percent}%</strong>
                </li>
              ))}
            </ul>
        </div>
        )}

        <div className="mt-6 flex gap-8">
          <button type="button" onClick={() => navigate('/', { replace: true })}>
            Nouveau scan
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            Retour
          </button>
        </div>
  </>
  )
}

export default ResultsPage