import * as ort from 'onnxruntime-web';

const modelUrl = '/models/model.onnx';

const sessionOption: ort.InferenceSession.SessionOptions = { 
  executionProviders: ['wasm'], // WebAssembly instance
  intraOpNumThreads: 1,
  graphOptimizationLevel: 'all', // Peut accélerer les inférences
 };

async function sessionInit() {
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
  console.log('Warm-up OK → output:', outputName);
};

sessionInit();
