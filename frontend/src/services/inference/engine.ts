import type * as ortTypes from 'onnxruntime-web';

// engine.ts (patch ensureOrt)

// --- récupère un size "sûr" depuis preprocess.json (fallback = 224)
async function getInputSize(): Promise<number> {
  try {
    const meta = await fetch('/models/preprocess.json').then(r => r.json());
    const s = Number(meta?.size);
    return Number.isFinite(s) && s > 0 ? s : 224;
  } catch {
    return 224;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

let ort: any;
let _ortPromise: Promise<any> | null = null;

export async function ensureOrt() {
  if (ort) return ort;
  if (_ortPromise) return _ortPromise;

  const CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';

  _ortPromise = (async () => {
    await loadScript(CDN + 'ort.min.js');

    const g = (window as any).ort;
    if (!g || !g.env || !g.env.wasm) {
      throw new Error('ORT UMD loaded but env/wasm not available');
    }

    // ⚠️ NE PAS réassigner g.env ni g.env.wasm — juste muter les champs autorisés
    g.env.logLevel = 'verbose';

    // JSEP: on n’a pas besoin de toucher webgpu/webnn; on force l’EP 'wasm' à la création
    // et on redirige les chemins jsep vers non-jsep via wasmPaths si ORT les touche.

    g.env.wasm.proxy = false;        // pas de worker (debug plus lisible)
    g.env.wasm.simd = true;
    g.env.wasm.numThreads = Math.max(2, (navigator.hardwareConcurrency ?? 4));

    // Préfixe unique (laisser ORT choisir le bon fichier) + anti-JSEP (redirige jsep → non-jsep)
    // Setter autorisé : on ne remplace pas l’objet, on affecte la propriété.
    g.env.wasm.wasmPaths = {
      'ort-wasm-simd-threaded.mjs':  CDN + 'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm': CDN + 'ort-wasm-simd-threaded.wasm',
      // Si jamais ORT tente JSEP, on le renvoie vers les non-JSEP
      'ort-wasm-simd-threaded.jsep.mjs':  CDN + 'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.jsep.wasm': CDN + 'ort-wasm-simd-threaded.wasm',
    };

    ort = g;
    console.log('[ensureOrt] ORT ready', {
      hasEnv: !!ort?.env,
      numThreads: ort?.env?.wasm?.numThreads,
      wasmPaths: ort?.env?.wasm?.wasmPaths,
    });
    return ort;
  })().finally(() => { _ortPromise = null; });

  return _ortPromise;
}


// --------- État session ----------
let _session: ortTypes.InferenceSession | null = null;
let _inputName: string | null = null;
let _outputName: string | null = null;
let _inputDims: number[] | null = null;

export async function loadEngine() {
  try {
    const startedAt = performance.now();
    const ort = await ensureOrt();

    const head = await fetch('/models/model.onnx', { method: 'GET' });
    console.log('[ORT] model:', head.status, head.headers.get('content-type'), head.headers.get('content-length'));
    console.log('Chargement du modèle…');

    // AVANT
    // const session = await ort.InferenceSession.create('/models/model.onnx', { ... });

    // test avec modèle de démo local (puis on remettra ton model.onnx)
    // const resnetAB = await (await fetch('/models/resnet50-v2-7.onnx')).arrayBuffer();
    const session = await ort.InferenceSession.create('/models/model.onnx', {
      executionProviders: ['wasm'],
      intraOpNumThreads: 1,
      graphOptimizationLevel: 'all',
    });
  
    const inputName = session.inputNames[0];
    const meta = (session.inputMetadata as any)[inputName];
    // 1) essaie de lire les dims du modèle
    let dims: number[] | null = null;
    const rawDims = meta?.dimensions ?? meta?.shape;
    if (Array.isArray(rawDims) && rawDims.length > 0) {
      // remplace -1 / undefined par 1
      dims = rawDims.map((d: any) => (typeof d === 'number' ? (d < 0 ? 1 : d) : 1));
    }
    // 2) sinon, fallback web-safe: [1,3,S,S] avec S cohérent au preprocess
    if (!dims || dims.length !== 4) {
      const S = await getInputSize();
      dims = [1, 3, S, S];
    }
    console.log('[warmup] inputName=', inputName, 'dims=', dims);

    // Warm-up
    const warmupSize = dims.reduce((a, b) => a * b, 1);
    const warmup = new ort.Tensor('float32', new Float32Array(warmupSize), dims);

    await session.run({ [inputName]: warmup });
    const outputName = session.outputNames[0];

    _session = session; _inputName = inputName; _outputName = outputName; _inputDims = dims;

    const ms = Math.round(performance.now() - startedAt);
    console.log('Warm-up OK →', { inputName, outputName, dims, ms });

    return { session, inputName, outputName, inputDims: dims, diagnostics: { ms, phase: 'engine_ready' } };
  } catch (e:any) {
    console.error('[loadEngine] FAILED', e?.message ?? e, e?.stack);
    // >>> renvoyer un diagnostic explicite pour l’UI
    throw new Error('[loadEngine] ' + (e?.message ?? String(e)));
  }
}

export function getEngine() {
  if (!_session || !_inputName || !_outputName || !_inputDims) {
    throw new Error("Engine non chargé — appelle loadEngine() d'abord.");
  }
  return { session: _session, inputName: _inputName, outputName: _outputName, inputDims: _inputDims };
}
