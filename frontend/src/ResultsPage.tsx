import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { TransferStore } from "./lib/transfer";

const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL

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
  const [rockInfos, setRockInfos] = useState<any[] | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  
  const result = state?.result;

  const confByLabel = new Map(
    (result?.top3 ?? []).map(t => [t.label.toLowerCase(), t.percent])
  );

  const getPercent = (label?: string | null) =>
  typeof label === "string"
    ? confByLabel.get(label.toLowerCase())
    : undefined;

  const isAbstained = !!result?.abstained;
  const top1Percent = getPercent(result?.top1_label) ?? Math.round((result?.top1_conf ?? 0) * 100);
  const isCertain = top1Percent === 100;

  // Liste des labels modèle, dans l'ordre Top-3
  const modelLabels = !result || isAbstained
  ? []
  : (isCertain
      ? [result.top1_label].filter(Boolean) as string[]
      : result.top3.map(t => t.label));
  
  const MODEL_TO_DB: Record<string, string> = {
    basalte: "Basalte",
    calcaire: "Calcaire",
    granite: "Granite",
    gres:     "Grès",
    schiste:  "Schiste",
  };
  const prettyLabel = (lab?: string | null) =>
    typeof lab === "string"
      ? (MODEL_TO_DB[lab.toLowerCase() as keyof typeof MODEL_TO_DB] ?? lab)
      : lab;

  // triplets { labelModel, nomDb, percent }
  const toQuery = modelLabels.map(lab => {
    const nomDb = MODEL_TO_DB[lab.toLowerCase() as keyof typeof MODEL_TO_DB];
    const pct = getPercent(lab) ?? (isCertain ? 100 : undefined);
    return nomDb ? { labelModel: lab, nomDb, percent: pct } : null;
  }).filter(Boolean) as { labelModel: string; nomDb: string; percent?: number }[];

  
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

  useEffect(() => {
    // 0) Cas "je ne sais pas" → pas d’appels
    if (!result || isAbstained) {
      setRockInfos(null);
      setInfoLoading(false);
      setInfoError(null);
      return;
    }

    if (toQuery.length === 0) {
      setRockInfos([]);
      setInfoLoading(false);
      setInfoError(null);
      return;
    }

    // 2) Garde-fous ENV
    if (!VITE_API_BASE_URL) {
      console.warn("VITE_API_BASE_URL manquant");
      setRockInfos([]);
      setInfoError("API non configurée (VITE_API_BASE_URL).");
      return;
    }

    // 3) Lancer les appels en parallèle, annulables
    const ac = new AbortController();
    setInfoLoading(true);
    setInfoError(null);

    (async () => {
      try {
        const promises = toQuery.map(item =>
          fetch(`${VITE_API_BASE_URL}/rocks?nom=${encodeURIComponent(item.nomDb)}`, {
            signal: ac.signal, headers: { Accept: "application/json" },
          }).then(async (r) => {
            if (!r.ok) throw new Error(String(r.status));
            const row = await r.json();
            return { item, row }; // on garde percent ici
          })
        );

        const settled = await Promise.allSettled(promises);

        // 4) Conserver l’ordre d’entrée et ignorer les échecs (404/500)
        const inOrder: Array<any & { __percent?: number }> = [];
        toQuery.forEach(q => {
          const hit = settled.find(s =>
            s.status === "fulfilled" && s.value.item.nomDb === q.nomDb
          ) as { status: "fulfilled"; value: { item: typeof q; row: any } } | undefined;

          if (hit) {
            const withPct = { ...hit.value.row, __percent: q.percent };
            inOrder.push(withPct);
          }
        });

        setRockInfos(inOrder);
      } catch (e: any) {
        if (e?.name === "AbortError") return; // navigation/cleanup
        setRockInfos(null);
        setInfoError("Impossible de récupérer les fiches.");
      } finally {
        setInfoLoading(false);
      }
    })();

    return () => ac.abort();
  }, [result, isAbstained, VITE_API_BASE_URL, JSON.stringify(toQuery)]);

  if (!file) return <p>Redirection…</p>;

  return (
    <>
      {preview
        ? <img src={preview} alt="Aperçu résultat" style={{ maxWidth: 240 }} />
        : <div className="w-60 h-40 bg-gray-800/40 rounded" aria-label="Aperçu indisponible" />
      }
      
      {!!result && (
        <div className="mt-4">
          <h2 className="text-center font-semibold">
            {isAbstained
              ? "Image non reconnue"
              : `${prettyLabel(result?.top1_label) ?? "—"} — ${top1Percent}%`}
          </h2>

          {/* Indices de confiances — uniquement les alternatives (sans Top-1) */}
          {!isAbstained && result && (
            (() => {
              const alts = (result.top3 ?? []).filter(
                t => (result.top1_label ?? "").toLowerCase() !== t.label.toLowerCase()
              );
              if (alts.length === 0) return null; // rien à montrer si 100%

              return (
                <div className="mt-6 text-center">
                  <strong>Autres prédictions :</strong>
                  <div className="mt-2 space-y-1 text-sm">
                    {alts.map((t) => (
                      <div key={t.index}>
                        <div>{prettyLabel(t.label)}: <strong>{t.percent}%</strong></div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      <section className="mt-6" aria-live="polite">
        {isAbstained && (
          <div className="mt-10 text-center">
            <p className="text-sm mb-4">
              Essaie un nouveau scan avec une photo plus nette / une autre lumière.
            </p>

            <button aria-label="Nouveau scan"
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              Nouveau scan
            </button>
          </div>
        )}


        {!isAbstained && !!result && (
          <div className="mt-8" aria-live="polite">
            <hr className="my-8 border-gray-600/40 w-2/3 mx-auto" />

            <h3 className="text-base font-semibold">
              Fiche informative : {prettyLabel(result?.top1_label)}
            </h3>

            {infoLoading && <p className="text-sm mt-2">Chargement des informations…</p>}

            {!infoLoading && infoError && (
              <p className="text-sm mt-2 text-red-600">{infoError}</p>
            )}

            {!infoLoading && !infoError && rockInfos && rockInfos.length === 0 && (
              <p className="text-sm mt-2">
                Aucune fiche trouvée pour ces labels. Tu peux relancer un scan.
              </p>
            )}

            {!infoLoading && !infoError && rockInfos && rockInfos.length > 0 && (
              <div className="mt-3 grid gap-8">
                <article className="rounded-xl border p-4 shadow-sm">
                  {/*Fiche informative*/}
                  {rockInfos[0].type && (
                    <p className="text-sm mt-2">
                      <strong>Type :</strong> {rockInfos[0].type}
                    </p>
                  )}
                  {rockInfos[0].texture && (
                    <p className="text-sm mt-2">
                      <strong>Texture :</strong> {rockInfos[0].texture}
                    </p>
                  )}
                  {rockInfos[0].mineraux_pincipaux && (
                    <p className="text-sm mt-2">
                      <strong>Minéraux principaux :</strong> {rockInfos[0].mineraux_pincipaux}
                    </p>
                  )}
                  {rockInfos[0].mineraux_secondaires && (
                    <p className="text-sm mt-2">
                      <strong>Minéraux secondaires :</strong> {rockInfos[0].mineraux_secondaires}
                    </p>
                  )}
                  {rockInfos[0].contexte && (
                    <p className="text-sm mt-2">
                      <strong>Contexte de formation :</strong> {rockInfos[0].contexte}
                    </p>
                  )}
                  {rockInfos[0].astuces_terrain && (
                    <p className="text-sm mt-2">
                      <strong>Astuces terrain :</strong> {rockInfos[0].astuces_terrain}
                    </p>
                  )}
                </article>
                
                <div className="mt-3 grid gap-8 place-items-center">
                  <hr className="my-6 border-gray-600/30 w-2/3 mx-auto" />
                  <button aria-label="Nouveau scan"
                    type="button"
                    onClick={() => navigate('/', { replace: true })}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Nouveau scan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}

export default ResultsPage