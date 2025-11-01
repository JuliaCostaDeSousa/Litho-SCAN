// conversion image → tenseur NCHW
export async function preprocessToNCHW(blob: Blob) {
    const datajson = await fetch('/models/preprocess.json').then(r => r.json());
    const datajson_mean = datajson.mean;
    const datajson_std = datajson.std;
    const datajson_size = datajson.size;

    const bmp = await createImageBitmap(blob).catch(() => { throw new Error("Impossible de décoder l'image."); });
    const canvas = document.createElement("canvas");
    canvas.width = datajson_size;
    canvas.height = datajson_size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Impossible de décoder l'image.");
    const minSide = Math.min(bmp.width, bmp.height);
    const sx = (bmp.width  - minSide) / 2;
    const sy = (bmp.height - minSide) / 2;
    ctx.drawImage(bmp, sx, sy, minSide, minSide, 0, 0, datajson_size, datajson_size);

    const dataRGB: ImageData = ctx.getImageData(0, 0, datajson_size, datajson_size); // RGB
    const data = dataRGB.data
    const out = new Float32Array(3 * datajson_size * datajson_size);
    // on boucle sur les pixels 
    for (let i = 0, p = 0; i < datajson_size * datajson_size; i++) {
        // on normalise
        const rN = data[p++]/255; //R normalisé
        const gN = data[p++]/255; //G normalisé
        const bN = data[p++]/255; //B normalisé
        p++ //A: alpha -> ignoré
        // on remplit le tenseur NCHW
        out[i] = (rN - datajson_mean[0]) / datajson_std[0];
        out[i +   datajson_size*datajson_size] = (gN - datajson_mean[1]) / datajson_std[1];
        out[i + 2*datajson_size*datajson_size] = (bN - datajson_mean[2]) / datajson_std[2];
    }

    return { data: out, size: datajson_size };
}
