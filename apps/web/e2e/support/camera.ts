import type { Page } from '@playwright/test';

interface CameraLog {
  /** As restrições de cada chamada a `getUserMedia`, na ordem. */
  calls: Array<{ video?: unknown; audio?: unknown } | null>;
  /** Cada trilha entregue, na ordem. */
  tracks: MediaStreamTrack[];
}

declare global {
  interface Window {
    __camera: CameraLog;
  }
}

/** Os estados que a câmera falsa do Chromium não produz. */
export type FakeCamera =
  | 'pending'
  | 'denied'
  | 'missing'
  /** Página fora de contexto seguro: `navigator.mediaDevices` indefinido. */
  | 'insecure'
  /** Uma câmera por `deviceId`, cada uma entregando vídeo de um canvas. */
  | { cameras: string[] };

/**
 * Troca `navigator.mediaDevices` antes de a página carregar. Chamado antes de `watchCamera`, para
 * o invólucro ficar em volta do que foi trocado.
 */
export function fakeCamera(page: Page, behaviour: FakeCamera) {
  return page.addInitScript((behaviour) => {
    const define = (value: unknown) =>
      Object.defineProperty(Navigator.prototype, 'mediaDevices', { configurable: true, get: () => value });
    if (behaviour === 'insecure') return void define(undefined);

    const fail = (name: string) => Promise.reject(new DOMException(name, name));
    const cameras = typeof behaviour === 'object' ? behaviour.cameras : [];
    const streamOf = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      let frame = 0;
      const paint = () => {
        context.fillStyle = `hsl(${(frame += 7) % 360} 60% 50%)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
      };
      paint();
      setInterval(paint, 50);
      return canvas.captureStream(20);
    };
    define({
      getUserMedia: () => {
        if (behaviour === 'pending') return new Promise(() => undefined);
        if (behaviour === 'denied') return fail('NotAllowedError');
        if (behaviour === 'missing') return fail('NotFoundError');
        return Promise.resolve(streamOf());
      },
      enumerateDevices: () =>
        Promise.resolve(cameras.map((deviceId) => ({ kind: 'videoinput', deviceId, groupId: deviceId, label: deviceId }))),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
  }, behaviour);
}

/** O invólucro do teste em torno de `getUserMedia`: registra as restrições pedidas e cada trilha entregue. */
export function watchCamera(page: Page) {
  return page.addInitScript(() => {
    const log: CameraLog = { calls: [], tracks: [] };
    window.__camera = log;
    const devices = navigator.mediaDevices as MediaDevices | undefined;
    if (!devices) return;
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async (constraints) => {
      log.calls.push(constraints === undefined ? null : JSON.parse(JSON.stringify(constraints)));
      const stream = await original(constraints);
      log.tracks.push(...stream.getTracks());
      return stream;
    };
  });
}

export const cameraCalls = (page: Page) => page.evaluate(() => window.__camera.calls);

/** O `readyState` e o tipo de cada trilha entregue, na ordem. */
export const trackStates = (page: Page) =>
  page.evaluate(() => window.__camera.tracks.map((track) => ({ kind: track.kind, state: track.readyState })));

/** O `deviceId` pedido numa chamada, escrito direto ou como `exact` ou `ideal`. */
export function deviceIdOf(call: { video?: unknown } | null): string | undefined {
  const video = call?.video;
  if (typeof video !== 'object' || video === null) return undefined;
  const { deviceId } = video as { deviceId?: string | { exact?: string; ideal?: string } };
  return typeof deviceId === 'object' ? (deviceId.exact ?? deviceId.ideal) : deviceId;
}
