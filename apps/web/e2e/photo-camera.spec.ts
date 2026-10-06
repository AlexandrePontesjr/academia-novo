import type { Page } from '@playwright/test';
import { cameraCalls, deviceIdOf, fakeCamera, trackStates, watchCamera } from './support/camera.ts';
import { expect, type FakeApi, servePhotoFile, test } from './support/fake-api.ts';
import {
  ajustar,
  choose,
  CROP_FRAME,
  decode,
  frameRatio,
  ID,
  PHOTO_PATH,
  PHOTO_URL,
  photoRequests,
  pngFile,
  READERS,
  serveFicha,
  studentOf,
  uploadOf,
  WRITERS,
} from './support/photo.ts';

const AREA = 'Arraste uma foto aqui ou escolha um arquivo';
const DENIED = 'Permita o uso da câmera no navegador ou envie um arquivo.';
const NO_CAMERA = 'Nenhuma câmera disponível neste dispositivo. Envie um arquivo.';
const PHOTO_ROUTE = `/api/students/${ID}/photo`;

const dialog = (page: Page) => page.getByRole('dialog');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const video = (page: Page) => dialog(page).locator('video');
const videoSize = (page: Page) => video(page).evaluate((element: HTMLVideoElement) => [element.videoWidth, element.videoHeight] as const);

/** A ficha aberta e "Usar câmera" acionado, com o invólucro de `getUserMedia` no lugar. */
async function openCamera(page: Page, api: FakeApi, photoUrl: string | null = null) {
  api.requests.length = 0;
  serveFicha(api, 'reception', studentOf({ photoUrl }));
  await page.goto(`/students/${ID}`);
  await button(page, 'Usar câmera').click();
}

/** Espera a imagem ao vivo chegar ao elemento `video`. */
async function live(page: Page) {
  await expect.poll(async () => (await videoSize(page))[0]).toBeGreaterThan(0);
  await expect(button(page, 'Capturar')).toBeEnabled();
}

test('usar_camera_button_for_writers_with_and_without_photo', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);

  for (const role of WRITERS) {
    for (const photoUrl of [PHOTO_URL, null]) {
      serveFicha(api, role, studentOf({ photoUrl }));

      await page.goto(`/students/${ID}`);

      await expect(button(page, 'Usar câmera'), `${role} ${photoUrl}`).toBeVisible();
    }
  }
});

test('live_video_without_audio_with_framing_text_and_capturar', async ({ page, api }) => {
  await watchCamera(page);
  await openCamera(page, api);

  await live(page);

  const calls = await cameraCalls(page);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.video).toBeTruthy();
  expect(calls[0]!.audio ?? false).toBe(false);
  const tracks = await video(page).evaluate((element: HTMLVideoElement) => {
    const stream = element.srcObject as MediaStream;
    return { video: stream.getVideoTracks().map((track) => track.readyState), audio: stream.getAudioTracks().length };
  });
  expect(tracks).toEqual({ video: ['live'], audio: 0 });
  await expect(dialog(page).getByText('Enquadre o rosto e os ombros', { exact: true })).toBeVisible();
  await expect(button(page, 'Capturar')).toBeVisible();
});

test('abrindo_camera_without_capturar_while_pending', async ({ page, api }) => {
  await fakeCamera(page, 'pending');
  await openCamera(page, api);

  await expect(dialog(page).getByText('Abrindo câmera…', { exact: true })).toBeVisible();
  await expect(button(page, 'Capturar')).toHaveCount(0);
});

test('capture_goes_to_the_editor_and_tirar_outra_returns_to_live', async ({ page, api }) => {
  await openCamera(page, api);
  api.on('POST', PHOTO_ROUTE, 'hang');
  await live(page);
  const [videoWidth, videoHeight] = await videoSize(page);

  await button(page, 'Capturar').click();

  const ratio = await frameRatio(dialog(page));
  expect(ratio).toBeGreaterThanOrEqual(0.74);
  expect(ratio).toBeLessThanOrEqual(0.76);
  await expect(dialog(page).getByLabel('Zoom', { exact: true })).toBeVisible();
  await expect(button(page, 'Girar à esquerda')).toBeVisible();
  await expect(button(page, 'Girar à direita')).toBeVisible();
  await expect(button(page, 'Tirar outra')).toBeVisible();
  expect(photoRequests(api), 'depois de capturar').toHaveLength(0);

  await button(page, 'Tirar outra').click();

  await live(page);
  await expect(dialog(page).locator(CROP_FRAME)).toHaveCount(0);
  expect(photoRequests(api), 'depois de tirar outra').toHaveLength(0);

  await button(page, 'Capturar').click();
  await button(page, 'Salvar foto').click();

  await expect.poll(() => photoRequests(api).length).toBe(1);
  const upload = uploadOf(photoRequests(api)[0]!);
  expect(upload.parts.map((part) => part.name)).toEqual(['file']);
  const image = await decode(page, upload.parts[0]!.bytes);
  // a maior região 3:4 do quadro do vídeo, limitada a 1200 de largura
  const region = videoWidth * 4 >= videoHeight * 3 ? (videoHeight * 3) / 4 : videoWidth;
  expect(image.width * 4).toBe(image.height * 3);
  expect(image.width).toBe(Math.min(1200, region));
});

test('denied_camera_shows_message_and_file_upload_still_opens_the_editor', async ({ page, api }) => {
  await fakeCamera(page, 'denied');
  await openCamera(page, api);

  await expect(dialog(page).getByText(DENIED, { exact: true })).toBeVisible();
  await expect(button(page, 'Capturar')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await choose(page, 'Enviar foto', pngFile(900, 1200));

  await expect(ajustar(page)).toBeVisible();
  await expect(ajustar(page).locator(CROP_FRAME)).toBeVisible();
});

test('no_camera_and_insecure_context_show_message_without_capturar', async ({ page, api }) => {
  for (const behaviour of ['missing', 'insecure'] as const) {
    // a troca mais recente de `navigator.mediaDevices` é a que vale na carga seguinte
    await fakeCamera(page, behaviour);
    await openCamera(page, api);

    await expect(dialog(page).getByText(NO_CAMERA, { exact: true }), behaviour).toBeVisible();
    await expect(button(page, 'Capturar'), behaviour).toHaveCount(0);
  }
});

test('trocar_camera_cycles_two_devices_and_is_absent_with_one', async ({ page, api }) => {
  await fakeCamera(page, { cameras: ['camera-da-frente', 'camera-de-tras'] });
  await watchCamera(page);
  await openCamera(page, api);
  await live(page);

  await expect(button(page, 'Trocar câmera')).toBeVisible();
  await button(page, 'Trocar câmera').click();
  await expect.poll(async () => (await cameraCalls(page)).length).toBe(2);
  expect(deviceIdOf((await cameraCalls(page))[1]!)).toBe('camera-de-tras');
  await live(page);

  await button(page, 'Trocar câmera').click();
  await expect.poll(async () => (await cameraCalls(page)).length).toBe(3);
  expect(deviceIdOf((await cameraCalls(page))[2]!)).toBe('camera-da-frente');

  await fakeCamera(page, { cameras: ['camera-unica'] });
  await openCamera(page, api);
  await live(page);

  await expect(button(page, 'Trocar câmera')).toHaveCount(0);
});

test('every_video_track_ended_after_capture_cancel_escape_and_switch', async ({ page, api }) => {
  await watchCamera(page);
  const exits: Array<[name: string, leave: () => Promise<void>]> = [
    ['Capturar', () => button(page, 'Capturar').click()],
    ['Cancelar', () => button(page, 'Cancelar').click()],
    ['Escape', () => page.keyboard.press('Escape')],
  ];

  for (const [name, leave] of exits) {
    await openCamera(page, api);
    await live(page);
    expect(await trackStates(page), name).toEqual([{ kind: 'video', state: 'live' }]);

    await leave();

    await expect.poll(() => trackStates(page), name).toEqual([{ kind: 'video', state: 'ended' }]);
  }

  // depois de capturar, "Tirar outra": a trilha nova está viva e a anterior continua encerrada
  await openCamera(page, api);
  await live(page);
  await button(page, 'Capturar').click();
  await button(page, 'Tirar outra').click();
  await live(page);
  expect(await trackStates(page)).toEqual([
    { kind: 'video', state: 'ended' },
    { kind: 'video', state: 'live' },
  ]);

  // "Trocar câmera": a trilha da câmera anterior. A câmera falsa do Chromium é uma só, então as duas vêm do teste
  await fakeCamera(page, { cameras: ['camera-da-frente', 'camera-de-tras'] });
  await watchCamera(page);
  await openCamera(page, api);
  await live(page);
  await button(page, 'Trocar câmera').click();
  await expect.poll(async () => (await trackStates(page)).length, 'Trocar câmera').toBe(2);
  await expect.poll(async () => (await trackStates(page))[0], 'Trocar câmera').toEqual({ kind: 'video', state: 'ended' });
});

test('read_only_profiles_have_no_camera_replace_or_upload_controls', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);

  for (const role of READERS) {
    for (const photoUrl of [PHOTO_URL, null]) {
      serveFicha(api, role, studentOf({ photoUrl }));

      await page.goto(`/students/${ID}`);

      const shown = photoUrl ? page.getByRole('img', { name: 'Foto de Marina Duarte' }) : page.getByRole('img', { name: 'Sem foto' });
      await expect(shown, `${role} ${photoUrl}`).toBeVisible();
      for (const control of ['Usar câmera', 'Trocar foto', 'Enviar foto', 'Remover foto']) {
        await expect(page.getByRole('button', { name: control }), `${role} ${photoUrl}: ${control}`).toHaveCount(0);
      }
      await expect(page.getByText(AREA), `${role} ${photoUrl}`).toHaveCount(0);
    }
  }
});

test('camera_save_posts_without_photo_and_puts_with_photo', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);
  const cases = [
    { name: 'sem foto', photoUrl: null, method: 'POST', other: 'PUT' },
    { name: 'com foto', photoUrl: PHOTO_URL, method: 'PUT', other: 'POST' },
  ];

  for (const { name, photoUrl, method, other } of cases) {
    await openCamera(page, api, photoUrl);
    // a API recebe e não responde: o que chega é o que "Salvar foto" enviou, sem passo nenhum depois
    api.on('POST', PHOTO_ROUTE, 'hang');
    api.on('PUT', PHOTO_ROUTE, 'hang');
    await live(page);
    await button(page, 'Capturar').click();
    await button(page, 'Salvar foto').click();

    await expect.poll(() => photoRequests(api).length, name).toBe(1);
    // nenhum outro diálogo entre "Salvar foto" e a requisição
    await expect(dialog(page), name).toHaveCount(1);
    expect(photoRequests(api).map((request) => request.method), name).toEqual([method]);
    expect(photoRequests(api).filter((request) => request.method === other), name).toHaveLength(0);
  }
});
