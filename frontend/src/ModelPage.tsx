// src/ModelPage.tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { useNavigate } from "react-router-dom";
import ImageButton from "./components/ui/ImageMaskedButton";
import { useEffect, useState } from "react";

type TrainingPoint = {
  epoch: number;
  phase: "head" | "ft";
  train_loss: number;
  val_loss: number;
  val_acc: number;
  f1_macro: number;
};

const APP_URL = "/identification"; // ou l’URL déployée si différente

const DATASET_DISTRIB = [
  { class: "Basalte", train: 55, val: 10, test: 10, total: 75 },
  { class: "Calcaire", train: 58, val: 12, test: 13, total: 83 },
  { class: "Granite", train: 60, val: 12, test: 12, total: 84 },
  { class: "Grès", train: 52, val: 10, test: 9, total: 71 },
  { class: "Schiste", train: 44, val: 9, test: 10, total: 63 },
];

const F1_PER_CLASS = [
  { class: "Basalte", f1: 0.7778, support: 10 },
  { class: "Calcaire", f1: 0.7, support: 13 },
  { class: "Granite", f1: 0.6452, support: 12 },
  { class: "Grès", f1: 0.6667, support: 9 },
  { class: "Schiste", f1: 0.75, support: 10 },
];

const TRAINING_CURVE: TrainingPoint[] = [
  { epoch: 0, phase: "head", train_loss: 1.3031, val_loss: 1.1501, val_acc: 0.5472, f1_macro: 0.5461 },
  { epoch: 1, phase: "head", train_loss: 0.7072, val_loss: 1.0122, val_acc: 0.5472, f1_macro: 0.5411 },
  { epoch: 2, phase: "head", train_loss: 0.5478, val_loss: 0.9833, val_acc: 0.5660, f1_macro: 0.5673 },
  { epoch: 3, phase: "head", train_loss: 0.4914, val_loss: 0.8716, val_acc: 0.6792, f1_macro: 0.6651 },
  { epoch: 4, phase: "head", train_loss: 0.4159, val_loss: 0.9235, val_acc: 0.6792, f1_macro: 0.6798 },
  { epoch: 5, phase: "head", train_loss: 0.3575, val_loss: 0.8719, val_acc: 0.6792, f1_macro: 0.6841 },
  { epoch: 6, phase: "head", train_loss: 0.3669, val_loss: 0.7688, val_acc: 0.7170, f1_macro: 0.7197 },
  { epoch: 7, phase: "head", train_loss: 0.3026, val_loss: 0.6959, val_acc: 0.7736, f1_macro: 0.7804 },
  { epoch: 8, phase: "head", train_loss: 0.2501, val_loss: 0.7299, val_acc: 0.7170, f1_macro: 0.7332 },
  { epoch: 9, phase: "head", train_loss: 0.3670, val_loss: 0.6658, val_acc: 0.7925, f1_macro: 0.7961 },
  { epoch: 10, phase: "ft", train_loss: 0.2858, val_loss: 0.5921, val_acc: 0.8113, f1_macro: 0.8117 },
  { epoch: 11, phase: "ft", train_loss: 0.2970, val_loss: 0.6982, val_acc: 0.6604, f1_macro: 0.6731 },
  { epoch: 12, phase: "ft", train_loss: 0.2533, val_loss: 0.6211, val_acc: 0.7547, f1_macro: 0.7530 },
  { epoch: 13, phase: "ft", train_loss: 0.1816, val_loss: 0.6005, val_acc: 0.7925, f1_macro: 0.7913 },
  { epoch: 14, phase: "ft", train_loss: 0.1579, val_loss: 0.6420, val_acc: 0.7736, f1_macro: 0.7708 },
  { epoch: 15, phase: "ft", train_loss: 0.1700, val_loss: 0.6281, val_acc: 0.7736, f1_macro: 0.7695 },
];

const EPOCH_TICKS = TRAINING_CURVE.map((p) => p.epoch);

const CONFUSION_MATRIX = {
  classes: ["Basalte", "Calcaire", "Granite", "Grès", "Schiste"],
  matrix: [
    [7, 0, 0, 0, 3],
    [0, 7, 5, 1, 0],
    [1, 0, 10, 0, 1],
    [0, 0, 3, 5, 1],
    [0, 0, 1, 0, 9],
  ],
};

const MODEL_SUMMARY = {
  totalImages: 376,
  numClasses: 5,
  testAcc: 0.7037,
  f1Macro: 0.7079,
  top3Acc: 0.9444,
  emissionsKg: 9.253741265776459e-5,
};

const Card: React.FC<{
  title?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, children, className = "" }) => (
  <section
    className={`rounded-2xl border border-[#17BDCD] bg-white/5 p-4 sm:p-6 ${className}`}
  >
    {title && (
      <h2 className="text-2xl font-semibold tracking-tight mb-3">{title}</h2>
    )}
    {children}
  </section>
);

function useSelectedEpoch(trainingCurve: TrainingPoint[]) {
  const [selectedEpoch, setSelectedEpoch] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/models/model_meta.json");
        const meta = await res.json();

        const targetValAcc = meta.val_coverage;

        const bestPoint = trainingCurve.reduce((best, curr) => {
          const diffCurr = Math.abs(curr.val_acc - targetValAcc);
          const diffBest = Math.abs(best.val_acc - targetValAcc);
          return diffCurr < diffBest ? curr : best;
        });

        setSelectedEpoch(bestPoint.epoch);
      } catch (err) {
        console.error("Erreur chargement model_meta.json", err);
      }
    }

    load();
  }, [trainingCurve]);

  return selectedEpoch;
}

export default function ModelPage() {
  const emissionsGrams = MODEL_SUMMARY.emissionsKg * 1000;
  const navigate = useNavigate();
  const selectedEpoch = useSelectedEpoch(TRAINING_CURVE);

  return (
    <main className="text-white text-[15.5px] sm:text-[16.5px]">
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="space-y-4 sm:space-y-6">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-center">
            Modèle IA &amp; Entraînement
          </h1>
          {/* 1) Trait sous le logo (inchangé ou très léger) */}
          <div
            aria-hidden
            className="mx-auto mt-6 sm:mt-7 mb-4 sm:mb-6 h-[2px] w-24 sm:w-32 rounded-full
                      bg-gradient-to-r from-transparent via-[#17BDCD]/80 to-transparent"
          />
          <p className="text-white/90 leading-relaxed" style={{ textAlign: "justify" }}>
            Litho-SCAN s’appuie sur un modèle de classification d’images
            entraîné spécifiquement sur cinq types de roches. Cette page
            présente le modèle choisi, le dataset, les principales
            métriques, ainsi que la façon dont les prédictions sont calibrées
            et suivies d’un point de vue environnemental.
          </p>

          <div className="grid gap-4 sm:grid-cols-3" style={{ textAlign: "justify" }}>
            <div className="rounded-xl bg-white/5 border border-[#17BDCD] p-3 sm:p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-white/70 mb-1" style={{ fontSize: "18px" }}>
                Modèle
              </p>
              <p className="font-semibold" style={{ fontSize: "17px" }}>MobileNetV3-Small</p>
              <p className="text-white/70 mt-1" style={{ fontSize: "14px" }}>
                Modèle léger pré-entraîné ImageNet, adapté à l’inférence web.
              </p>
            </div>
            <div className="rounded-xl bg-white/5 border border-[#17BDCD] p-3 sm:p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-white/70 mb-1" style={{ fontSize: "18px" }}>
                Dataset
              </p>
              <p className="font-semibold" style={{ fontSize: "17px" }}>
                {MODEL_SUMMARY.totalImages} images ·{" "}
                {MODEL_SUMMARY.numClasses} classes
              </p>
              <p className="text-xs text-white/70 mt-1" style={{ fontSize: "14px" }}>
                Basalte, calcaire, granite, grès, schiste.
              </p>
            </div>
            <div className="rounded-xl bg-white/5 border border-[#17BDCD] p-3 sm:p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-white/70 mb-1" style={{ fontSize: "18px" }}>
                Performances (test)
              </p>
              <p className="font-semibold" style={{ fontSize: "17px" }}>
                {(MODEL_SUMMARY.testAcc * 100).toFixed(1)}% accuracy · F1-macro{" "}
                {(MODEL_SUMMARY.f1Macro * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-white/70 mt-1" style={{ fontSize: "14px" }}>
                Top-3 accuracy :{" "}
                {(MODEL_SUMMARY.top3Acc * 100).toFixed(1)}%.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-14 space-y-8 sm:space-y-10 ">
        {/* DATASET & SOURCES */}
        <Card title="Dataset & sources">
          <div className="space-y-5">

            {/* Bloc 1 — Composition & origine */}
            <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
              <div className="text-2xl leading-none">🔎</div>
              <div className="space-y-1">
                <h4 className="font-semibold" style={{ fontSize: "18px" }}>
                  Composition du dataset
                </h4>
                <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                  Le dataset utilisé pour entraîner le modèle Litho-SCAN regroupe des images
                  provenant de sources publiques variées (Wikimedia Commons, sets Kaggle et
                  images libres).
                </p>
                <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                  Objectif : constituer un ensemble compact mais diversifié représentant les
                  5 classes de roches.
                </p>
              </div>
            </article>

            {/* Bloc 2 — Inventaire et organisation */}
            <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
              <div className="text-2xl leading-none">🗒️</div>
              <div className="space-y-1">
                <h4 className="font-semibold" style={{ fontSize: "18px" }}>
                  Inventaire & organisation
                </h4>
                <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                  Toutes les images sont décrites dans un fichier d’inventaire (
                  <code>Inventory.xlsx</code>) : classe, URL source, remarques...  
                  Cet inventaire sert de référence pour vérifier les licences, suivre la
                  couverture des classes et générer les splits train / val / test.
                </p>
              </div>
            </article>

            {/* Bloc 3 — Accès public & dataset Kaggle */}
            <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
              <div className="text-2xl leading-none">🌐</div>
              <div className="space-y-1">
                <h4 className="font-semibold" style={{ fontSize: "18px" }}>
                  Accès public au dataset
                </h4>
                <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                  Pour respecter les licences des images originales, les photos d’entraînement ne sont 
                  pas redistribuées.  
                  En revanche, l’inventaire complet (sources, licences, documentation) est disponible
                  publiquement sur Kaggle.  
                  Un mini-set de démonstration, 100% libre de droits, est également intégré dans
                  l’application — accessible via le bouton <span className="italic font-semibold">« Utiliser un exemple » </span>
                  dans la page <span className="italic font-semibold">Identification</span>.
                </p>
              </div>
            </article>

            {/* Bouton Kaggle */}
            <div className="w-full max-w-[360px] mx-auto">
              <ImageButton
                src="/ui/btn-full.png"
                label="Voir le dataset Kaggle"
                onClick={() => window.open(
                  "https://www.kaggle.com/datasets/juliacostadesousa/litho-scan-rock-image-dataset-inventory",
                  "_blank"
                )}
                fluid
                minWidth={220}
                maxWidth={360}
                aspect={3.2}
                hoverEffect={false}
              />
            </div>

          </div>
        </Card>



        {/* REPARTITION & SPLITS */}
        <Card title="Répartition du dataset">
          <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr] items-start" style={{ textAlign: "justify" }}>
            <div className="space-y-3 min-w-0">
              <p className="leading-relaxed text-white/90">
                Le modèle est entraîné sur un jeu de{" "}
                <span className="font-medium">376 images</span> réparties de
                façon raisonnablement équilibrée entre 5 classes de roches.
                Les images sont décrites dans des fichiers de manifeste, ce qui
                permet :
              </p>
              <ul className="list-disc pl-5 space-y-1 text-white/85">
                <li>
                  de vérifier que chaque fichier existe bien avant l’entraînement,
                </li>
                <li>
                  de contrôler que les mêmes classes sont présentes en
                  train / val / test (entraînement / validation / test),
                </li>
                <li>
                  de suivre facilement la répartition par split pour chaque
                  type de roche.
                </li>
              </ul>

              <div className="mt-3 text-xs sm:text-sm">
                <div className="overflow-x-auto w-full">
                  <table className="w-full border-separate border-spacing-y-1 rounded-xl border border-[#17BDCD]">
                    <thead>
                      {/* Ligne 1 : en-tête groupé */}
                      <tr className="text-[11px] sm:text-xs text-white/70 uppercase bg-white/5" style={{ fontSize: "14px" }}>
                        <th className="px-3 py-2 align-bottom rounded-l-lg text-center">
                          Classe
                        </th>
                        <th
                          className="px-3 py-2 align-bottom border-l border-white/10 text-center"
                          colSpan={3}
                        >
                          Splits
                        </th>
                        <th className="px-3 py-2 align-bottom border-l border-white/10 text-center">
                          Total
                        </th>
                        <th className="px-3 py-2 align-bottom border-l border-white/10 rounded-r-lg text-center">
                          % du dataset
                        </th>
                      </tr>
                      {/* Ligne 2 : noms de colonnes */}
                      <tr className="text-[11px] sm:text-xs text-white/60 uppercase" style={{ fontSize: "14px" }}>
                        <th className="px-3 py-1 text-center"></th>
                        <th className="px-3 py-1 text-center border-l border-white/10">
                          Train
                        </th>
                        <th className="px-3 py-1 text-center border-l border-white/10">
                          Val
                        </th>
                        <th className="px-3 py-1 text-center border-l border-white/10">
                          Test
                        </th>
                        <th className="px-3 py-1 text-center border-l border-white/10">
                          Total
                        </th>
                        <th className="px-3 py-1 text-center border-l border-white/10">
                          %
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {DATASET_DISTRIB.map((row) => {
                        const pct = (row.total / MODEL_SUMMARY.totalImages) * 100;

                        // opacité entre ~0.25 et ~0.9 pour la pastille
                        const alpha = 0.25 + 0.65 * (pct / 100);

                        return (
                          <tr
                            key={row.class}
                            className="bg-white/5 hover:bg-white/10 transition-colors"
                            style={{ fontSize: "14px" }}
                          >
                            <td className="px-3 py-1.5 font-medium text-center">
                              {row.class}
                            </td>
                            <td className="px-3 py-1.5 text-center font-mono tabular-nums border-l border-white/10">
                              {row.train}
                            </td>
                            <td className="px-3 py-1.5 text-center font-mono tabular-nums border-l border-white/10">
                              {row.val}
                            </td>
                            <td className="px-3 py-1.5 text-center font-mono tabular-nums border-l border-white/10">
                              {row.test}
                            </td>
                            <td className="px-3 py-1.5 text-center font-mono tabular-nums border-l border-white/10 font-semibold">
                              {row.total}
                            </td>
                            {/* Pastille graphique pour le % */}
                            <td className="px-3 py-1.5 text-center border-l border-white/10">
                              <span
                                className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[14px] font-mono tabular-nums"
                                style={{
                                  backgroundColor: `rgba(56,189,248,${alpha})`, // #38bdf8 avec alpha
                                  color: alpha > 0.5 ? "#0b1120" : "#e5f6ff",
                                }}
                              >
                                {pct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Ligne total */}
                      <tr className="bg-white/10 text-[14px]">
                        <td className="px-3 py-1.5 font-semibold text-white/90 rounded-l-lg text-center uppercase">
                          Total
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono tabular-nums border-l border-white/15 text-white/90">
                          269
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono tabular-nums border-l border-white/15 text-white/90">
                          53
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono tabular-nums border-l border-white/15 text-white/90">
                          54
                        </td>
                        <td className="px-3 py-1.5 text-center font-mono tabular-nums border-l border-white/15 font-semibold text-white">
                          376
                        </td>
                        <td className="px-3 py-1.5 text-center border-l border-white/15 rounded-r-lg">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full font-mono tabular-nums bg-cyan-500 text-slate-950">
                            100.0%
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-sm text-white/80 mt-2">
                Un rapport de préparation de données est généré automatiquement
                pour documenter les totaux, la proportion de chaque classe et
                d’éventuelles anomalies (fichiers manquants, lignes invalides).
              </p>
            </div>

            <div className="rounded-xl border border-[#17BDCD] px-3 py-2">
              <p className="text-sm font-medium mb-2">
                Répartition par classe et par split
              </p>
              <div className="w-full flex justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={DATASET_DISTRIB}
                    margin={{ top: 20, right: 5, left: 5, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff22" />
                    <XAxis dataKey="class" stroke="#ffffffdb" />
                    {/* ⬇️ On cache l’axe Y pour ne plus décaler le plot */}
                    <YAxis
                      stroke="#ffffffdb"
                      width={35}          // réduit l'espace réservé
                      tickSize={5}       // enlève les traits horizontaux
                      tick={{ dx: -5 }} // décale les labels à gauche
                      domain={[0, 90]}
                      tickCount={7}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderRadius: 12,
                        border: "1px solid #ffffff33",
                        fontSize: 12,
                      }}
                      itemSorter={(item) => {
                        const order: Record<string, number> = {
                          Test: 0,
                          Val: 1,
                          Train: 2,
                        };
                        return order[item.name as string] ?? 99;
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="left"
                      itemSorter={(item) => {
                        const order: Record<string, number> = {
                          Train: 0,
                          Val: 1,
                          Test: 2,
                        };
                        return order[item.value as string] ?? 99;
                      }}
                      wrapperStyle={{ marginBottom: -2}}
                    />
                    <Bar dataKey="train" stackId="a" name="Train" fill="#17BDCD" />
                    <Bar dataKey="val" stackId="a" name="Val" fill="#3b82f6" />
                    <Bar dataKey="test" stackId="a" name="Test" fill="#a855f7" />
                  </BarChart>
                </ResponsiveContainer>

              </div>
            </div>
          </div>
        </Card>

        {/* SCORES & F1 */}
        <Card title="Performances de test & F1 par classe">
          <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr] items-start" style={{ textAlign: "justify" }}>
            <div className="space-y-3">
              <p className="leading-relaxed text-white/90">
                Le modèle est évalué sur un jeu de test séparé de{" "}
                <span className="font-medium">54 images</span>. Les métriques
                suivies sont celles que l’on retrouve classiquement en
                classification d’images :
              </p>
              <ul className="list-disc pl-5 space-y-1 text-white/85">
                <li>
                  l’<span className="font-medium">accuracy</span> globale,
                </li>
                <li>
                  le <span className="font-medium">F1-macro</span>, qui donne le
                  même poids à chaque classe,
                </li>
                <li>
                  la <span className="font-medium">Top-3 accuracy</span>, utile
                  pour l’interface quand plusieurs roches sont plausibles,
                </li>
                <li>
                  les scores F1 <span className="italic">par classe</span> et
                  la matrice de confusion.
                </li>
              </ul>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mt-3">
                <div className="rounded-xl border border-[#17BDCD] p-3 sm:p-4 text-center">
                  <p className="text-white/70 uppercase mb-1" style={{ fontSize: "18px"}}>
                    Accuracy (test)
                  </p>
                  <p className="font-semibold" style={{ fontSize: "17px"}}>
                    {(MODEL_SUMMARY.testAcc * 100).toFixed(1)}%
                  </p>
                  <p className="text-white/70 mt-1" style={{ fontSize: "14px"}}>
                    Sur l’ensemble des images du jeu de test.
                  </p>
                </div>
                <div className="rounded-xl border border-[#17BDCD] p-3 sm:p-4 text-center">
                  <p className="text-xs text-white/70 uppercase mb-1" style={{ fontSize: "18px"}}>
                    F1-macro (test)
                  </p>
                  <p className="text-lg font-semibold" style={{ fontSize: "17px"}}>
                    {(MODEL_SUMMARY.f1Macro * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-white/70 mt-1" style={{ fontSize: "14px"}}>
                    Permet de mieux voir l’équilibre entre les classes.
                  </p>
                </div>
                <div className="rounded-xl border border-[#17BDCD] p-3 sm:p-4 text-center">
                  <p className="text-xs text-white/70 uppercase mb-1" style={{ fontSize: "18px"}}>
                    Top-3 accuracy
                  </p>
                  <p className="text-lg font-semibold" style={{ fontSize: "17px"}}>
                    {(MODEL_SUMMARY.top3Acc * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-white/70 mt-1" style={{ fontSize: "14px"}}>
                    Dans la grande majorité des cas, la bonne roche est dans le
                    Top-3 proposé par l’application.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#17BDCD] px-3 py-2 text-white/80">
              <p className="text-sm font-medium mb-2">
                F1 par classe (set de test)
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={F1_PER_CLASS}
                  margin={{ top: 20, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff22" />
                  <XAxis dataKey="class" stroke="#ffffffdb" />
                  {/* ⬇️ plus de décalage à cause de l’axe Y */}
                  <YAxis
                    stroke="#ffffffdb"
                    width={40}
                    tickSize={5}
                    tick={{ dx: -5 }}
                    domain={[0, 1]}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#020617",
                      borderRadius: 12,
                      border: "1px solid #ffffff33",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                  />
                  <Legend verticalAlign="bottom" align="left" />
                  <Bar
                    dataKey="f1"
                    name="F1 par classe"
                    fill="#17BDCD"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Matrice de confusion */}
          <div className="mt-6">

            <p className="text-sm font-medium mb-3">
              Matrice de confusion (test)
            </p>

            <div className="grid sm:grid-cols-2 gap-6 text-sm">

              {/* Colonne gauche — Tableau */}
              <div className="overflow-x-auto">
                <table className="border-separate border-spacing-[2px] rounded-xl border border-[#17BDCB] text-center">
                  <thead>
                    <tr>
                      <th className="px-0 py-1 text-sm text-white/80">Réel ↓ / Prédit →</th>
                      {CONFUSION_MATRIX.classes.map((c) => (
                        <th
                          key={c}
                          className="px-2 py-1 text-sm text-white/80 text-center"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {CONFUSION_MATRIX.matrix.map((row, i) => (
                      <tr key={CONFUSION_MATRIX.classes[i]}>
                        <td className="px-2 py-1 text-sm text-white/80">
                          {CONFUSION_MATRIX.classes[i]}
                        </td>

                        {row.map((v, j) => {
                          const maxRow = Math.max(...row);
                          const alpha = maxRow === 0 ? 0 : 0.2 + 0.6 * (v / maxRow);

                          return (
                            <td
                              key={j}
                              className="px-2 py-1 text-center rounded-md"
                              style={{
                                backgroundColor:
                                  v === 0
                                    ? "rgba(15,23,42,0.7)"
                                    : `rgba(23,189,205,${alpha})`,
                              }}
                            >
                              {v}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Colonne droite — Explication centrée verticalement */}
              <div className="self-center space-y-2 sm:text-[13px] text-white/80 text-justify" style={{ fontSize: "15px"}}>
                <p>
                  La matrice compare les <span className="font-medium">vraies classes </span>
                  (lignes) aux <span className="font-medium">classes prédites</span> (colonnes).
                  L’idéal est d’avoir un maximum de valeurs sur la diagonale.
                </p>

                <p>
                  Sur ce modèle, le <span className="font-medium">schiste</span> et le
                  <span className="font-medium"> granite</span> sont très bien reconnus,
                  alors que certaines images de <span className="font-medium">calcaire </span>
                  ou de <span className="font-medium">grès</span> sont parfois confondues
                  avec le granite.
                </p>

                <p>
                  Ces confusions reflètent des ressemblances visuelles réelles entre les roches
                  et indiquent où il serait le plus utile d’augmenter le dataset ou
                  d’affiner l’entraînement.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* PIPELINE D'ENTRAINEMENT */}
        <Card title="Pipeline d’entraînement">
          <div className="gap-6 items-stretch">
            {/* Bloc texte — passe en dessous du graph sur mobile */}
            <div className="space-y-3">
              <p className="leading-relaxed text-white/90" style={{ textAlign: "justify" }}>
                L’entraînement est géré par un script Python unique (
                <code>train.py</code>) qui va du chargement des CSV jusqu’à
                l&apos;export du modèle ONNX et des métriques finales. 
              </p>
              <p>Les points importants :</p>
              {/* Points importants du pipeline */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">

                {/* Architecture */}
                <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                  <div className="text-2xl leading-none">🤖</div>
                  <div className="space-y-1">
                    <h4 className="font-semibold" style={{ fontSize: "18px" }}>Modèle</h4>
                    <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                      MobileNetV3-Small de torchvision, avec une tête remplacée par une couche
                      linéaire à 5 sorties (une par classe).
                    </p>
                  </div>
                </article>

                {/* Preprocessing */}
                <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                  <div className="text-2xl leading-none">🖼️</div>
                  <div className="space-y-1">
                    <h4 className="font-semibold" style={{ fontSize: "18px" }}>Pré-traitement</h4>
                    <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                      Conversion en RGB, augmentations légères (crop aléatoire, flips, rotation,
                      jitter lumière / contraste), normalisation ImageNet.
                    </p>
                  </div>
                </article>

                {/* Optimisation */}
                <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                  <div className="text-2xl leading-none">📈</div>
                  <div className="space-y-1">
                    <h4 className="font-semibold" style={{ fontSize: "18px" }}>Optimisation</h4>
                    <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                      Optimiseur Adam avec weight_decay=1e-4, scheduler ReduceLROnPlateau (facteur 0.1,
                      patience 3) et entraînement AMP (mix-precision) quand possible.
                    </p>
                  </div>
                </article>

                {/* Reproductibilité */}
                <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                  <div className="text-2xl leading-none">🔁</div>
                  <div className="space-y-1">
                    <h4 className="font-semibold" style={{ fontSize: "18px" }}>Reproductibilité</h4>
                    <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                      Seed fixée (42), désactivation du benchmark CuDNN et mode déterministe
                      activé pour des résultats reproductibles.
                    </p>
                  </div>
                </article>
              </div>


              <p className="leading-relaxed text-white/90 mt-3">
                La fonction <code>fit()</code> orchestre les deux phases
                d&apos;entraînement (head-only, puis fine-tuning léger),
                en gérant :
              </p>
              <ul className="list-disc pl-5 space-y-1 text-white/85">
                <li>les DataLoaders (train / val / test),</li>
                <li>
                  le tracking des meilleures performances (checkpoint{" "}
                  <code>best_phase1.ckpt</code> /{" "}
                  <code>best_phase2.ckpt</code>),
                </li>
                <li>
                  un scheduler (<code>ReduceLROnPlateau</code>) et un early stopping
                  sur la loss de validation pour éviter d’entraîner inutilement.
                </li>
                <li>
                  la génération des logs CSV (<code>train_log.csv</code>),
                </li>
                <li>le test final + export des scores JSON et de la CM.</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* COURBES & MÉTRIQUES D'ENTRAÎNEMENT */}
        <Card title="Courbes & métriques d’entraînement">
          <div className="space-y-8">
            <p className="text-white/90 mt-4">
              L’entraînement est organisé en deux phases avec <span className="font-medium">
              un nombre d’epochs maximum et un early stopping</span> :
              la phase <span className="font-medium">"Head"</span> peut aller jusqu’à 10 epochs, 
              et la phase <span className="font-medium">"FT"</span> (fine-tuning) jusqu’à 20. 
              Dans le run affiché, la première phase utilise
              ses 10 epochs complètes, tandis que la phase de fine-tuning est arrêtée
              automatiquement après quelques epochs supplémentaires dès que la
              loss de validation ne s’améliore plus pendant plusieurs epochs de suite
              (patience = 5).
            </p>
            {/* Graph train_loss et val_loss */}
            <div className="rounded-xl border border-[#17BDCD] px-3 py-2">
              <p className="text-sm font-medium mb-2">
                Train loss &amp; Val loss par epoch
              </p>

              <div className="w-full overflow-x-auto h-[280px]">
                <div className="min-w-[520px] sm:min-w-full">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart
                      data={TRAINING_CURVE}
                      margin={{ top: 20, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff22" />

                      <ReferenceArea
                        x1={0}
                        x2={9.5}
                        fill="#59ff17ff"
                        fillOpacity={0.08}
                        label={{
                          value: "Phase 1 — Head",
                          position: "insideTop",
                          fill: "#59ff1794",
                          fontSize: 12,
                        }}
                      />
                      <ReferenceArea
                        x1={9.5}
                        x2={15}
                        fill="#ff1b41ff"
                        fillOpacity={0.08}
                        label={{
                          value: "Phase 2 — FT",
                          position: "insideTop",
                          fill: "#ff1b41ce",
                          fontSize: 12,
                        }}
                      />

                      <XAxis
                        dataKey="epoch"
                        stroke="#ffffffdb"
                        tickFormatter={(e) => `${e}`}
                        allowDecimals={true}
                        interval={0}
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        ticks={EPOCH_TICKS}
                      />
                      <YAxis
                        stroke="#ffffffdb"
                        width={35}
                        tickSize={5}
                        tick={{ dx: -5 }}
                        domain={["dataMin - 0.1", "dataMax + 0.1"]}
                        tickFormatter={(v) => {
                          const raw = Array.isArray(v) ? v[0] : v;
                          const num = Number(raw);
                          return num.toFixed(2);
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderRadius: 12,
                          border: "1px solid #ffffff33",
                          fontSize: 12,
                        }}
                        formatter={(value) => {
                          const raw = Array.isArray(value) ? value[0] : value;
                          const num = Number(raw);
                          return num.toFixed(4);
                        }}
                        labelFormatter={(label) => `Epoch ${label}`}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="left"
                        wrapperStyle={{ marginBottom: -15 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="train_loss"
                        name="Train loss"
                        stroke="#17BDCD"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="val_loss"
                        name="Val loss"
                        stroke="#a855f7"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="text-[14px] text-white/70 mt-6 space-y-1"> 
                <p>• Phase &quot;Head&quot; (epochs 0–9) : seule la tête est entraînée.</p>
                <p>• Phase &quot;FT&quot; (epochs 10–15) : fine-tuning ; dégel des 2 derniers blocs pour un ajustement plus fin.</p>
              </div>
            </div>
            <p className="text-white/90 mt-4">
              La courbe montre une baisse régulière de la loss d&apos;entraînement, suivie
              par une loss de validation qui descend globalement dans le même ordre de
              grandeur. On n&apos;observe pas de sur-apprentissage massif : la loss
              validation reste proche de la loss train, avec quelques fluctuations normales
              lors de la phase de fine-tuning.
            </p>
            {/* Graph val_acc & F1-macro */}
            <div className="rounded-xl border border-[#17BDCD] px-3 py-2">
              <p className="text-sm font-medium mb-2">
                Validation accuracy &amp; F1-macro par epoch
              </p>

              <div className="w-full overflow-x-auto h-[280px]">
                <div className="min-w-[520px] sm:min-w-full">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart
                      data={TRAINING_CURVE}
                      margin={{ top: 20, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff22" />

                      <ReferenceArea
                        x1={0}
                        x2={9.5}
                        fill="#59ff17ff"
                        fillOpacity={0.08}
                        label={{
                          value: "Phase 1 — Head",
                          position: "insideTop",
                          fill: "#59ff1794",
                          fontSize: 12,
                        }}
                      />
                      <ReferenceArea
                        x1={9.5}
                        x2={15}
                        fill="#ff1b41ff"
                        fillOpacity={0.08}
                        label={{
                          value: "Phase 2 — FT",
                          position: "insideTop",
                          fill: "#ff1b41ce",
                          fontSize: 12,
                        }}
                      />

                      <XAxis
                        dataKey="epoch"
                        stroke="#ffffffdb"
                        tickFormatter={(e) => `${e}`}
                        allowDecimals={true}
                        interval={0}
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        ticks={EPOCH_TICKS}
                      />
                      <YAxis
                        stroke="#ffffffdb"
                        width={35}
                        tickSize={5}
                        tick={{ dx: -5 }}
                        domain={[0.5, 0.85]}
                        tickFormatter={(v) => `${Math.round(v * 100)}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderRadius: 12,
                          border: "1px solid #ffffff33",
                          fontSize: 12,
                        }}
                        formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                        labelFormatter={(label) => `Epoch ${label}`}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="left"
                        wrapperStyle={{ marginBottom: -15 }}
                      />
                      {selectedEpoch !== null && (
                        <ReferenceLine
                          x={selectedEpoch}
                          stroke="#ffd413ff"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={{
                            value: `Epoch choisie`,
                            position: "top",
                            fill: "#ffd413ff",
                            fontSize: 11,
                          }}
                        />
                      )}

                      <Line
                        type="monotone"
                        dataKey="val_acc"
                        name="Val accuracy"
                        stroke="#17BDCD"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="f1_macro"
                        name="F1-macro"
                        stroke="#a855f7"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="text-[14px] text-white/70 mt-6 space-y-1"> 
                <p>• Phase &quot;Head&quot; (epochs 0–9) : seule la tête est entraînée.</p>
                <p>• Phase &quot;FT&quot; (epochs 10–15) : fine-tuning ; dégel des 2 derniers blocs pour un ajustement plus fin.</p>
              </div>
            </div>
            <p className="text-white/90 mt-4">
              L&apos;accuracy de validation et le F1-macro augmentent nettement au fil des
              epochs, avec un léger creux lors d&apos;une epoch moins stable (11ème). L&apos;epoch
              marquée en pointillé correspond à celle utilisée pour l&apos;inférence dans
              l&apos;application&nbsp;: elle offre un bon compromis entre performance,
              stabilité des métriques et couverture sur le set de validation.
            </p>
          </div>
        </Card>


        {/* CALIBRATION & ABSTENTION */}
        <Card title="Calibration des incertitudes & seuils d’abstention">
          <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">

            {/* Colonne gauche en cartes */}
            <div className="space-y-4">

              <p className="leading-relaxed text-white/90">
                L’objectif n’est pas seulement d’afficher une prédiction, mais
                aussi de savoir <span className="font-medium">quand le modèle
                n’est pas assez sûr</span>. Litho-SCAN applique donc une
                calibration simple et des seuils d’abstention.
              </p>

              <div className="grid sm:grid-cols-3 gap-4 text-center">

                {/* Température */}
                <div className="p-4 rounded-xl border border-[#17BDCD] space-y-2">
                  <h4 className="uppercase text-white/70 gap-2" style={{ fontSize: "18px"}}>
                    Température
                  </h4>
                  <p className="text-white/90 font-semibold leading-relaxed" style={{ fontSize: "17px"}}>T = 0.90</p>
                  <p className="text-white/70 text-xs leading-relaxed" style={{ fontSize: "14px"}}>
                    Ajuste la calibration des probabilités : une température plus élevée
                    rend les probabilités plus lisses et mieux calibrées.
                  </p>
                </div>

                {/* Seuils */}
                <div className="p-4 rounded-xl border border-[#17BDCD] space-y-2">
                  <h4 className="uppercase text-white/70 gap-2" style={{ fontSize: "18px"}}>
                    Seuils
                  </h4>
                  <p className="text-white/90 font-semibold leading-relaxed" style={{ fontSize: "17px"}}>τ = 0.54 · Δ = 0.05</p>
                  <p className="text-white/70 text-xs leading-relaxed" style={{ fontSize: "14px"}}>
                    Le modèle exige une confiance minimale de 54% et un écart d’au moins 5 points
                    entre la 1ʳᵉ et la 2ᵉ classe pour valider une prédiction.
                  </p>
                </div>

                {/* Abstention */}
                <div className="p-4 rounded-xl border border-[#17BDCD] space-y-2">
                  <h4 className="uppercase text-white/70 gap-2" style={{ fontSize: "18px"}}>
                    Abstention
                  </h4>
                  <p className="text-white/90 font-semibold leading-relaxed" style={{ fontSize: "17px"}}>Basée sur T, τ et Δ</p>
                  <p className="text-white/70 text-xs leading-relaxed" style={{ fontSize: "14px"}}>
                    Si la confiance est trop faible ou si deux classes sont trop proches,
                    l’application préfère afficher "Image non reconnue" plutôt qu’une mauvaise prédiction.
                  </p>
                </div>
              </div>

              <p className="text-sm text-white/85">
                Les paramètres retenus sont stockés dans un fichier de métadonnées
                utilisé par l’inférence dans le navigateur.
              </p>
            </div>

            {/* Colonne droite */}
            <div className="rounded-xl border border-[#17BDCD] p-4 space-y-3">
              <h3 className="text-base font-semibold" style={{ fontSize: "18px"}}>Comment c’est utilisé côté front</h3>
              <ul className="list-disc pl-5 space-y-1 text-white/85" style={{ fontSize: "15px"}}>
                <li>Lecture des classes et paramètres de calibration</li>
                <li>Évaluation de la confiance pour décider d’afficher ou non une classe</li>
                <li>Construction du Top-3 affiché à l’utilisateur</li>
              </ul>
              <p className="text-white/80 mt-1" style={{ fontSize: "15px"}}>
                Assure une cohérence parfaite entre la validation hors-navigateur
                et l’expérience utilisateur réelle.
              </p>
            </div>
          </div>
        </Card>


        {/* EMISSIONS CO2 */}
        <Card title="Empreinte carbone de l’entraînement">
          <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr] items-start" style={{ textAlign: "justify" }}>
            <div className="space-y-3">
              <p className="leading-relaxed text-white/90">
                Pour Litho-SCAN, j’ai souhaité suivre aussi{" "}
                <span className="font-medium">
                  l’impact environnemental de l’entraînement
                </span>. Les runs sont mesurés avec CodeCarbon, qui estime les
                émissions à partir de la consommation CPU / GPU et du mix
                énergétique local.
                L’inférence n’est pas mesurée car elle s’exécute directement dans le navigateur de l’utilisateur (onnxruntime-web), sans GPU serveur ni requêtes API. Son impact énergétique est très faible — comparable à celui d’un petit calcul local — et difficile à estimer précisément de manière standardisée.
                Le suivi se concentre donc sur la phase réellement coûteuse : l’entraînement.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-white/85">
                <li>
                  Environnement : machine personnelle avec GPU RTX 4060 Laptop,
                  exécution sous Linux/WSL2 en France.
                </li>
                <li>
                  Mesure toutes les 30 secondes pendant l’entraînement, puis
                  agrégation en une estimation d’empreinte carbone.
                </li>
                <li>
                  Les résultats sont stockés avec les artefacts du run pour
                  pouvoir être tracés et comparés dans le temps.
                </li>
              </ul>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div className="rounded-xl border border-[#17BDCD] p-3 text-center">
                  <p className="text-white/70 uppercase mb-1" style={{ fontSize: "18px"}}>
                    Émissions estimées
                  </p>
                  <p className="text-white/90 font-semibold" style={{ fontSize: "17px"}}>
                    {emissionsGrams.toFixed(3)} g CO₂e
                  </p>
                  <p className="text-white/70 mt-1" style={{ fontSize: "14px"}}>
                    Soit environ {MODEL_SUMMARY.emissionsKg.toExponential(2)} kg
                    CO₂e pour un run complet du modèle.
                  </p>
                </div>
                <div className="rounded-xl border border-[#17BDCD] p-3">
                  <p className="text-white/70 uppercase mb-1 text-center" style={{ fontSize: "18px"}}>
                    Interprétation
                  </p>
                  <p className="text-white/90" style={{ fontSize: "14px"}}>
                    L’impact reste très faible (ordre de grandeur d’une
                    petite activité numérique du quotidien), mais le fait de
                    le mesurer et de le documenter fait partie intégrante de
                    la démarche du projet.
                  </p>
                </div>
              </div>
            </div>

            {/* Bloc comparateur CO₂ avec image locale */}
            <div className="rounded-2xl border border-[#17BDCD] p-4 space-y-3 text-sm">
              <h3 className="text-sm font-medium mb-2">Comparateur CO₂</h3>
              <div className="mt-2 flex justify-center">
                <img
                  src="/ui/impactco2_etiquette_sharp.png"
                  alt="Étiquette animée Impact CO₂ illustrant l’empreinte carbone estimée"
                  className="w-full rounded-xl border border-[#17BDCD] shadow-lg"
                />
              </div>
              <p className="text-sm text-white/80">
                Illustration de l’ordre de grandeur des émissions, basée sur
                le simulateur Impact CO₂ (ADEME).
              </p>
            </div>
          </div>
        </Card>

        {/* ARTEFACTS PRODUITS */}
        <Card title="Artefacts produits par l’entraînement">
          <section className="mx-auto max-w-6xl px-4 pt-4">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* 1. Modèle ONNX */}
              <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                <div className="text-2xl leading-none">🤖</div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Modèle ONNX</h3>
                  <p
                    className="text-[15px] sm:text-[17px] leading-relaxed text-white/90"
                  >
                    Version exportée du modèle pour l’inférence dans le navigateur
                    (onnxruntime-web), prête à être intégrée au front.
                  </p>
                </div>
              </article>

              {/* 2. Config de pré-traitement */}
              <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                <div className="text-2xl leading-none">🖼️</div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Pré-traitement</h3>
                  <p
                    className="text-[15px] sm:text-[17px] leading-relaxed text-white/90"
                  >
                    Paramètres de resize, normalisation et ordre des canaux, pour garder
                    exactement la même chaîne entre training et interface web.
                  </p>
                </div>
              </article>

              {/* 3. Métriques complètes */}
              <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                <div className="text-2xl leading-none">📊</div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Métriques de test</h3>
                  <p
                    className="text-[15px] sm:text-[17px] leading-relaxed text-white/90"
                  >
                    Accuracy, F1-macro, Top-3 accuracy, matrice de confusion et scores
                    par classe, exportés en JSON pour être réutilisés dans la doc ou le front.
                  </p>
                </div>
              </article>

              {/* 4. Calibration & seuils */}
              <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                <div className="text-2xl leading-none">🎯</div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Calibration &amp; seuils</h3>
                  <p
                    className="text-[15px] sm:text-[17px] leading-relaxed text-white/90"
                  >
                    Température, seuils de confiance et conditions d’abstention (tau, delta, T)
                    utilisés côté navigateur pour décider quand le modèle répond ou non.
                  </p>
                </div>
              </article>

              {/* 5. Model card */}
              <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                <div className="text-2xl leading-none">🗂️</div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Model card</h3>
                  <p
                    className="text-[15px] sm:text-[17px] leading-relaxed text-white/90"
                  >
                    Fiche synthétique décrivant le contexte d’usage, les données, les limites
                    et les précautions à prendre avec cette version du modèle.
                  </p>
                </div>
              </article>

              {/* 6. Logs d’émissions CO₂ */}
              <article className="rounded-xl border border-[#17BDCD] p-4 flex gap-3">
                <div className="text-2xl leading-none">🌍</div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Logs d’émissions CO₂</h3>
                  <p
                    className="text-[15px] sm:text-[17px] leading-relaxed text-white/90"
                  >
                    Fichiers CodeCarbon associés au run d’entraînement, pour suivre
                    l’empreinte carbone et comparer les futures versions du modèle.
                  </p>
                </div>
              </article>
            </div>
          </section>
        </Card>

        {/* Trait*/}
        <div
          aria-hidden
          className="mx-auto mt-6 sm:mt-7 mb-4 sm:mb-6 h-[2px] w-24 sm:w-32 rounded-full
                    bg-gradient-to-r from-transparent via-[#17BDCD]/80 to-transparent"
        />

        {/* CTA final soft */}
        <section className="text-center">
          <ImageButton
            src="/ui/btn-full.png"
            label="Lancer l’application"
            fluid
            minWidth={220}
            maxWidth={360}
            aspect={3.2}
            hoverEffect={false}
            onClick={() => navigate(APP_URL)}
          />
          {/* Trait*/}
          <div
            aria-hidden
            className="mx-auto mt-6 sm:mt-7 mb-4 sm:mb-6 h-[2px] w-24 sm:w-32 rounded-full
                      bg-gradient-to-r from-transparent via-[#17BDCD]/80 to-transparent"
          />
          <p className="text-sm text-white/70">
            Cette page documente la première version du modèle Litho-SCAN
            (5 classes). Les prochaines itérations pourront élargir le jeu de
            données, ajouter de nouvelles roches et affiner la calibration
            pour des usages plus exigeants.
          </p>
        </section>
      </div>
    </main>
  );
}
