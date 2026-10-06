/** O quadro de recorte e o que sai do navegador (foto-captura, S4): sempre 3:4. */
export const ASPECT = 3 / 4;
export const MAX_ZOOM = 3;
/** O servidor recusa menos que 300×400; o zoom para onde a região enquadrada teria esse tamanho. */
const MIN_WIDTH = 300;
/** O JPEG enviado tem no máximo 1200×1600 e nunca é ampliado. */
const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.9;

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Largura e altura da imagem depois de girada em `rotation` graus (múltiplo de 90). */
function rotated(image: HTMLImageElement, rotation: number): [width: number, height: number] {
  return rotation % 180 === 0 ? [image.naturalWidth, image.naturalHeight] : [image.naturalHeight, image.naturalWidth];
}

/** Largura, em pixels da origem, da maior região 3:4 que a imagem comporta nesse giro. */
function widestRegion(image: HTMLImageElement, rotation: number): number {
  const [width, height] = rotated(image, rotation);
  return Math.min(width, height * ASPECT);
}

/** A imagem comporta uma região 3:4 de 300×400 nesse giro. */
export const fits = (image: HTMLImageElement, rotation: number) => widestRegion(image, rotation) >= MIN_WIDTH;

/** O zoom máximo nesse giro: 3×, ou menos quando 3× deixaria a região abaixo de 300×400. */
export function maxZoomOf(image: HTMLImageElement, rotation: number): number {
  const limit = Math.floor((widestRegion(image, rotation) / MIN_WIDTH) * 100) / 100;
  return Math.max(1, Math.min(MAX_ZOOM, limit));
}

/** Lê o arquivo como imagem no próprio navegador; `undefined` se o navegador não consegue. */
export async function loadImage(file: Blob): Promise<HTMLImageElement | undefined> {
  const image = new Image();
  image.src = URL.createObjectURL(file);
  try {
    await image.decode();
    return image;
  } catch {
    URL.revokeObjectURL(image.src);
    return undefined;
  }
}

/**
 * Desenha num JPEG a região enquadrada. `region` vem em pixels da imagem já girada, que é como o
 * `react-easy-crop` a devolve.
 */
export function drawRegion(image: HTMLImageElement, region: Region, rotation: number): Promise<Blob> {
  const scale = Math.min(1, MAX_WIDTH / region.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(region.width * scale);
  canvas.height = Math.round(region.height * scale);
  const context = canvas.getContext('2d')!;
  const [width, height] = rotated(image, rotation);

  // o JPEG não tem transparência: o que a imagem não cobre sai branco
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.scale(scale, scale);
  context.translate(-region.x, -region.y);
  context.translate(width / 2, height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas sem imagem'))), 'image/jpeg', JPEG_QUALITY),
  );
}
