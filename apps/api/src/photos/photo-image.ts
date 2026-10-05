import type { PhotoVariant } from '@academia/contracts';
import sharp from 'sharp';
import { validationProblem } from '../problem.filter.ts';

/** O que o `422` diz do arquivo (`path` igual a `file`, AD-021). */
const MIN_SIZE_MESSAGE = 'A foto precisa ter pelo menos 300×400 pixels.';
const TOO_MANY_PIXELS_MESSAGE = 'A foto tem pixels demais: o máximo é 40 milhões.';
const UNREADABLE_MESSAGE = 'Não foi possível ler a imagem. Envie outro arquivo.';

const MIN_WIDTH = 300;
const MIN_HEIGHT = 400;
const MAX_PIXELS = 40_000_000;

export const VARIANT_SIZES: Record<PhotoVariant, { width: number; height: number }> = {
  thumb: { width: 96, height: 128 },
  medium: { width: 240, height: 320 },
  large: { width: 600, height: 800 },
};

/** O formato pelos primeiros bytes: o nome e o `Content-Type` que o cliente declarou não entram (RF-13). */
export function detectFormat(bytes: Buffer): 'jpeg' | 'png' | 'webp' | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return undefined;
}

const refused = (message: string) => validationProblem([{ path: 'file', message }]);

/**
 * As três variantes WebP, sem metadado: o recorte centralizado preenche o quadro sem distorcer, a
 * orientação EXIF é aplicada antes e nada do arquivo original sobra (RF-14). Dimensão, resolução e
 * arquivo que não decodifica respondem `422` no `file`.
 */
export async function makeVariants(bytes: Buffer): Promise<Record<PhotoVariant, Buffer>> {
  const metadata = await sharp(bytes, { limitInputPixels: false })
    .metadata()
    .catch(() => undefined);
  if (!metadata?.width || !metadata.height) throw refused(UNREADABLE_MESSAGE);
  if (metadata.width * metadata.height > MAX_PIXELS) throw refused(TOO_MANY_PIXELS_MESSAGE);
  // as orientações 5 a 8 giram a imagem em 90 graus: a leitura em pé troca largura e altura
  const turned = (metadata.orientation ?? 1) >= 5;
  const width = turned ? metadata.height : metadata.width;
  const height = turned ? metadata.width : metadata.height;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) throw refused(MIN_SIZE_MESSAGE);

  try {
    const { width: largeWidth, height: largeHeight } = VARIANT_SIZES.large;
    const large = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize(largeWidth, largeHeight, { fit: 'cover', position: 'centre' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = { raw: { width: large.info.width, height: large.info.height, channels: large.info.channels } };
    const encode = (size?: { width: number; height: number }) => {
      const image = sharp(large.data, raw);
      return (size ? image.resize(size.width, size.height, { fit: 'fill' }) : image).webp({ quality: 82 }).toBuffer();
    };
    return {
      thumb: await encode(VARIANT_SIZES.thumb),
      medium: await encode(VARIANT_SIZES.medium),
      large: await encode(),
    };
  } catch {
    throw refused(UNREADABLE_MESSAGE);
  }
}
