import { preprocessToNCHW } from "./preprocess";
import { loadEngine, getEngine, ensureOrt } from "./engine";

let LABELS: string[] = [];
let T = 1;
let TAU = 0.6;
let DELTA = 0.05;
let META_LOADED = false;

// utils locaux (pas de spread => pas de stack overflow)
function arrMin(a: ArrayLike<number>) {
  let m = Infinity;
  for (let i = 0; i < a.length; i++) if (a[i] < m) m = a[i];
  return m;
}
function arrMax(a: ArrayLike<number>) {
  let m = -Infinity;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}
function arrMean(a: ArrayLike<number>) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

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
  console.log('[predict] start');
  try {
    await loadMeta();
    const engine = await loadEngine();
    console.log('[predict] engine', engine?.diagnostics ?? {});

    const { session, inputName } = getEngine();
    const { data, size } = await preprocessToNCHW(file);
    console.log('[predict] tensor shape', [1,3,size,size], 'inputName', inputName);

    const sum = arrMean(data) * data.length; // si tu tiens au "sum"
    const minIn = arrMin(data);
    const maxIn = arrMax(data);
    console.log('[dbg] input stats:', {
    sum, minIn, maxIn, first10: Array.from(data.subarray(0, 10))
    });

    const ort = await ensureOrt();
    const tensor = new ort.Tensor('float32', data, [1, 3, size, size]);

    let outputs: Record<string, any>;
    try {
      outputs = await session.run({ [inputName]: tensor });
    } catch (e: any) {
      console.error('[predict] session.run FAILED', e?.message ?? e, e);
      throw new Error('[session.run] ' + (e?.message ?? e));
    }

    const outputName = session.outputNames[0];
    const out = outputs[outputName];
    console.log('[predict] outputs keys', Object.keys(outputs), 'expected', outputName, 'out=', out);

    if (!out) {
      throw new Error(`[outputs] missing "${outputName}" (got: ${Object.keys(outputs).join(', ')})`);
    }

    const logits = (out.data as Float32Array) ?? (out as Float32Array);
    if (!logits || typeof logits.length !== 'number') {
      console.error('[predict] bad logits tensor', out);
      throw new Error('[outputs] invalid logits buffer');
    }
    console.log('[predict] logits length', logits.length);
    const minLog = arrMin(logits);
    const maxLog = arrMax(logits);
    const meanLog = arrMean(logits);
    console.log('[dbg] logits stats:', {
    len: logits.length, minLog, maxLog, meanLog,
    first10: Array.from(logits.subarray(0, 10))
    });
    // 🛡️ Garde-fou : si labels ≠ logits, on génère des labels génériques pour ne pas crasher
    const labels =
      LABELS.length === logits.length
        ? LABELS
        : Array.from({ length: logits.length }, (_, i) => `class_${i}`);

    if (LABELS.length !== logits.length) {
      console.warn(`[predict] Labels (${LABELS.length}) ≠ logits (${logits.length}) — using generic labels for this run.`);
    }

    const probs = softmax(logits, T);
    console.log('[dbg] probs first5:', Array.from(probs.slice(0,5)));

    const top3Raw = topK(probs, 3);
    const abstained = top3Raw[0].prob < TAU || (top3Raw[0].prob - top3Raw[1].prob) < DELTA;
    const top3 = top3Raw.map(t => ({
      index: t.index,
      label: labels[t.index],
      prob: t.prob,
      percent: Math.round(t.prob * 100),
    }));

    console.log('[predict] done', top3);
    return {
      top3,
      top1_label: top3[0]?.label ?? null,
      top1_conf: top3[0]?.prob ?? 0,
      abstained,
    };
  } catch (e: any) {
    console.error('[predict] FAILED', e?.message ?? e, e);
    throw e; // laisse l’UI afficher l’erreur
  }
}