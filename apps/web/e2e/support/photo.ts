import type { Role, Student } from '@academia/contracts';
import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { type FakeApi, type Recorded, type RecordedUpload, sessionOf } from './fake-api.ts';

export const ID = '018f0000-0000-7000-8000-000000000301';
export const PHOTO_ID = '018f0000-0000-7000-8000-000000000999';
export const PHOTO_PATH = `/api/photo-files/${PHOTO_ID}/medium`;
export const PHOTO_URL = `${PHOTO_PATH}?exp=2000000000&sig=assinatura`;

export const WRITERS: Role[] = ['admin', 'reception'];
export const READERS: Role[] = ['hr_finance', 'instructor'];

export function studentOf(overrides: Partial<Student> = {}): Student {
  return {
    id: ID,
    name: 'Marina Duarte',
    status: 'active',
    cpf: '52998224725',
    birthDate: '2000-01-01',
    sex: 'female',
    email: 'marina@exemplo.com',
    phone: '11912345678',
    address: 'Rua das Acácias, 120',
    emergencyContactName: 'Maria da Penha',
    emergencyContactPhone: '1134567890',
    healthNotes: 'Hipertensão controlada',
    photoUrl: null,
    ...overrides,
  };
}

/** O que a API devolve na ficha de cada perfil: `photoUrl` vai para os quatro (AD-033). */
export function fichaFor(role: Role, student: Student): Partial<Student> {
  if (role === 'instructor') return { id: student.id, name: student.name, status: student.status, photoUrl: student.photoUrl };
  if (role === 'hr_finance') return Object.fromEntries(Object.entries(student).filter(([key]) => key !== 'healthNotes'));
  return student;
}

export function serveFicha(api: FakeApi, role: Role, student: Student) {
  api.session = sessionOf(role);
  api.on('GET', `/api/students/${student.id}`, { status: 200, body: fichaFor(role, student) });
}

/** A ficha lê o `photoUrl` do estado, que o envio, a troca e a remoção mudam como a API mudaria. */
export function serveMutableFicha(api: FakeApi, role: Role, state: { photoUrl: string | null }) {
  api.session = sessionOf(role);
  api.on('GET', `/api/students/${ID}`, () => ({ status: 200, body: fichaFor(role, studentOf({ photoUrl: state.photoUrl })) }));
}

/** "Requisição de foto": qualquer requisição, de qualquer método, a `/api/students/<id>/photo`. */
export const photoRequests = (api: FakeApi): Recorded[] =>
  api.requests.filter((request) => request.path === `/api/students/${ID}/photo`);

export const uploadOf = (request: Recorded) => request.body as RecordedUpload;

export type Rgb = [red: number, green: number, blue: number];
const RED: Rgb = [225, 20, 20];
const BLUE: Rgb = [20, 20, 225];
const GREY: Rgb = [128, 128, 128];

/** Uma imagem nascida de pixels dentro do teste. */
export function pngOf(width: number, height: number, colourAt: (x: number, y: number) => Rgb = () => GREY): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = colourAt(x, y);
      const at = (y * width + x) * 4;
      png.data[at] = red;
      png.data[at + 1] = green;
      png.data[at + 2] = blue;
      png.data[at + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

export const pngFile = (width: number, height: number, name = `imagem-${width}x${height}.png`) => ({
  name,
  mimeType: 'image/png',
  buffer: pngOf(width, height),
});

/** 800×800 de metade esquerda vermelha e direita azul. */
export const redLeftBlueRight = () => ({
  name: 'vermelho-azul.png',
  mimeType: 'image/png',
  buffer: pngOf(800, 800, (x) => (x < 400 ? RED : BLUE)),
});

export const isRed = ([red, green, blue]: Rgb) => red >= 200 && green <= 60 && blue <= 60;
export const isBlue = ([red, green, blue]: Rgb) => blue >= 200 && red <= 60 && green <= 60;

export interface Decoded {
  width: number;
  height: number;
  /** Coluna `floor(largura × 0,25)` e `floor(largura × 0,75)`, na linha do meio. */
  atWidth25: Rgb;
  atWidth75: Rgb;
  /** Linha `floor(altura × 0,25)` e `floor(altura × 0,75)`, na coluna do meio. */
  atHeight25: Rgb;
  atHeight75: Rgb;
}

/** Decodifica, no navegador do teste e sem passar pelo editor, a imagem que a API falsa recebeu. */
export function decode(page: Page, bytes: Buffer): Promise<Decoded> {
  return page.evaluate(async (base64) => {
    const raw = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([raw]));
    const { width, height } = bitmap;
    const context = new OffscreenCanvas(width, height).getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const at = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3)) as [number, number, number];
    const [midX, midY] = [Math.floor(width / 2), Math.floor(height / 2)];
    return {
      width,
      height,
      atWidth25: at(Math.floor(width * 0.25), midY),
      atWidth75: at(Math.floor(width * 0.75), midY),
      atHeight25: at(midX, Math.floor(height * 0.25)),
      atHeight75: at(midX, Math.floor(height * 0.75)),
    };
  }, bytes.toString('base64'));
}

/** O quadro de recorte: o elemento que delimita a região que será salva. O único ponto que o nomeia. */
export const CROP_FRAME = '[data-testid="cropper"]';

/** Largura ÷ altura do quadro de recorte, lida do `getBoundingClientRect`. */
export async function frameRatio(scope: Page | Locator): Promise<number> {
  const frame = scope.locator(CROP_FRAME);
  await frame.waitFor({ state: 'visible' });
  return frame.evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    return width / height;
  });
}

export const ajustar = (page: Page) => page.getByRole('dialog', { name: 'Ajustar foto' });

export interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** Escolhe o arquivo pelo botão dado e devolve os tipos que o campo de arquivo aceita. */
export async function choose(page: Page, button: string, file: TestFile): Promise<string[]> {
  const waiting = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  const chooser = await waiting;
  const accept = (await chooser.element().getAttribute('accept')) ?? '';
  await chooser.setFiles(file);
  return accept
    .split(',')
    .map((type) => type.trim())
    .sort();
}

/** Larga o arquivo sobre o elemento que exibe `text`. */
export function dropOn(page: Page, text: string, file: TestFile) {
  return page.getByText(text).evaluate(
    (target, { name, type, base64 }) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      transfer.items.add(new File([bytes], name, { type }));
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    },
    { name: file.name, type: file.mimeType, base64: file.buffer.toString('base64') },
  );
}
