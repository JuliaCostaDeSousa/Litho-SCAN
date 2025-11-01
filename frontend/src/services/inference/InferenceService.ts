import { preprocessToNCHW } from "./preprocess.ts"
import { loadEngine, getEngine } from "./engine.ts"
import * as ort from 'onnxruntime-web';

let LABELS: string[] = [];
let T = 1;
let TAU = 0.6;
let DELTA = 0.05;
let META_LOADED = false;

export type TopItem = { index: number; prob: number };

export function topK(probs: ArrayLike<number>, k = 3): TopItem[] {
  // on transforme le tableau en liste d’objets {index, prob}
  const arr: TopItem[] = Array.from({ length: probs.length }, (_, i) => ({
    index: i,
    prob: probs[i],
  }));

  // on trie du plus grand au plus petit
  arr.sort((a, b) => b.prob - a.prob);

  // on garde les k premiers
  return arr.slice(0, k);
}

export function softmax(logits: ArrayLike<number>, temperature = 1): Float32Array {
  let m = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > m) m = logits[i];
  const exps = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const v = Math.exp((logits[i] - m) / temperature);
    exps[i] = v;
    sum += v;
  }
  for (let i = 0; i < exps.length; i++) exps[i] /= sum;
  return exps;
}

export async function loadMeta() {
  if (META_LOADED) return;
  const meta = await fetch('/models/model_meta.json').then(r => r.json());
  LABELS = meta.classes;
  T = Number(meta.temperature);
  TAU = Number(meta.threshold_tau);
  DELTA = Number(meta.threshold_delta);
  META_LOADED = true;
}

export async function predict(file: Blob) {
  try {
    await loadMeta()
    await loadEngine();

    const { session, inputName } = getEngine();
    const { data, size } = await preprocessToNCHW(file);
    const tensor = new ort.Tensor('float32', data, [1, 3, size, size]);
    const outputs = await session.run({[inputName]: tensor})

    const logits = (outputs as any)[session.outputNames[0]].data as Float32Array;
    const probs = softmax(logits, T);
    if (LABELS.length !== probs.length) throw new Error(`Labels=${LABELS.length} ≠ logits=${probs.length}`);
    const top3Raw = topK(probs, 3);
    const abstained = top3Raw[0].prob < TAU || (top3Raw[0].prob - top3Raw[1].prob) < DELTA;
    const top3 = top3Raw.map(t => ({
        index: t.index,
        label: LABELS[t.index],
        prob: t.prob,
        percent: Math.round(t.prob * 100),
    }));
    
    return { 
      top3, 
      top1_label: top3[0]?.label ?? null,
      top1_conf: top3[0]?.prob ?? 0,
      abstained
    }
  } catch (e:any) {
    console.error(e);
    throw new Error(e?.message ?? "Échec de l'inférence");
  }
}
