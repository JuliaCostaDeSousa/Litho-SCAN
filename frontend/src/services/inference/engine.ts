import * as ort from 'onnxruntime-web';
let _session: ort.InferenceSession | null = null;
let _inputName: string | null = null;
let _outputName: string | null = null;
let _inputDims: number[] | null = null;

const modelUrl = '/models/model.onnx';

const sessionOption: ort.InferenceSession.SessionOptions = { 
  executionProviders: ['wasm'], // WebAssembly instance
  intraOpNumThreads: 1,
  graphOptimizationLevel: 'all', // Peut accélerer les inférences
 };

export async function loadEngine() {
  if (_session) {
    return { session: _session, inputName: _inputName!, outputName: _outputName!, inputDims: _inputDims! };
  }
  console.log('Chargement du modèle…');
  const session = await ort.InferenceSession.create(modelUrl, sessionOption);
  console.log('Session chargée ✅');
  console.log('Entrées :', session.inputNames);
  console.log('Sorties :', session.outputNames);
  
  const inputName = session.inputNames[0];
  const meta = (session.inputMetadata as any)[inputName]; // index par nom
  const rawDims = meta.dimensions ?? meta.shape // selon la version
  const dims: number[] = [];
  // on veut remplacer les valeurs négatives ou string('batch') donnés eventuellement par meta.shape par 1
  for (const d of rawDims) {
    if (typeof d === 'number') {
      dims.push(d < 0 ? 1 : d);   // remplace -1 par 1
    } else {
      dims.push(1);               // remplace "batch" ou autre par 1
    }
  }
  const dtype: 'float32' = 'float32'; // on force float32 côté WASM
  const size = dims.reduce((a, b) => a * b, 1); // s'adapte aux dimensions variables
  const zeros = new Float32Array(size);
  const warmupTensor  = new ort.Tensor(dtype, zeros, dims);
  
  await session.run({[inputName]: warmupTensor})
  const outputName = session.outputNames[0];

    _session = session;
  _inputName = inputName;
  _outputName = session.outputNames[0];
  _inputDims = dims;

  console.log('Warm-up OK → output:', outputName);
  return { session: _session, inputName: _inputName, outputName: _outputName, inputDims: _inputDims };
}

export function getEngine() {
  if (!_session || !_inputName || !_outputName || !_inputDims) {
    throw new Error('Engine non chargé — appeller loadEngine() d\'abord.');
  }
  return { session: _session, inputName: _inputName, outputName: _outputName, inputDims: _inputDims };
}
