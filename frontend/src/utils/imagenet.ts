export async function imagenetCenterCrop224(blob: Blob): Promise<Blob> {
  // 1) decode (createImageBitmap gère mieux l’orientation qu’un <img>)
  const bmp = await createImageBitmap(blob as any);

  const srcW = bmp.width;
  const srcH = bmp.height;

  // 2) scale: plus petit côté -> 256
  const TARGET_SHORT = 256;
  const scale = TARGET_SHORT / Math.min(srcW, srcH);
  const scaledW = Math.round(srcW * scale);
  const scaledH = Math.round(srcH * scale);

  // 3) draw sur un canvas aux dimensions "scaled"
  const stage = document.createElement("canvas");
  stage.width = scaledW;
  stage.height = scaledH;
  const sctx = stage.getContext("2d")!;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(bmp, 0, 0, scaledW, scaledH);
  bmp.close();

  // 4) crop centre 224×224
  const SIZE = 224;
  const sx = Math.floor((scaledW - SIZE) / 2);
  const sy = Math.floor((scaledH - SIZE) / 2);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = SIZE;
  outCanvas.height = SIZE;
  const octx = outCanvas.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(stage, sx, sy, SIZE, SIZE, 0, 0, SIZE, SIZE);

  // 5) export en JPEG (ou PNG si tu préfères garder la transparence)
  const out: Blob = await new Promise((res, rej) =>
    outCanvas.toBlob(b => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png", 0.92)
  );

  return out;
}

/** Petit util pratique pour un preview URL à révoquer ensuite */
export async function makeObjectUrl(blob: Blob): Promise<string> {
  return URL.createObjectURL(blob);
}
