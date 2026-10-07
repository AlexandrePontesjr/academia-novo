import type { Page } from '@playwright/test';
import { expect, type FakeApi, problem, servePhotoFile, test } from './support/fake-api.ts';
import {
  ajustar,
  choose,
  decode,
  dropOn,
  PHOTO_PATH,
  PHOTO_URL,
  pngFile,
  type TestFile,
} from './support/photo.ts';
import {
  serveStaffAs,
  STAFF_ID,
  STAFF_ROLES,
  type StaffState,
  staffOf,
  staffPhotoRequests,
  staffRequests,
  uploadOf,
} from './support/staff.ts';

const AREA = 'Arraste uma foto aqui ou escolha um arquivo';
const PHOTO_ROUTE = `/api/staff/${STAFF_ID}/photo`;
const NAME = 'Rafaela Prado Cunha';

const state = (photoUrl: string | null): StaffState => ({ staff: [staffOf({ photoUrl })], users: [] });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const saveButton = (page: Page) => ajustar(page).getByRole('button', { name: 'Salvar foto', exact: true });

/** O JPEG que a API falsa recebeu, decodificado pelo teste, sem passar pelo editor: largura × 4 = altura × 3. */
async function expectJpeg3by4(page: Page, api: FakeApi, message: string) {
  const [request] = staffPhotoRequests(api);
  const upload = uploadOf(request!);
  expect(upload.contentType, message).toMatch(/^multipart\/form-data\b/);
  expect(upload.parts.map((part) => part.name), message).toEqual(['file']);
  const bytes = upload.parts[0]!.bytes;
  expect([...bytes.subarray(0, 3)], `${message}: JPEG`).toEqual([0xff, 0xd8, 0xff]);
  const image = await decode(page, bytes);
  expect(image.width * 4, message).toBe(image.height * 3);
}

test('staff_photo_block_states_with_and_without_photo', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);

  for (const role of STAFF_ROLES) {
    serveStaffAs(api, role, state(PHOTO_URL));
    await page.goto(`/staff/${STAFF_ID}`);

    const photo = page.getByRole('img', { name: `Foto de ${NAME}` });
    await expect(photo, `${role}: com foto`).toBeVisible();
    await expect(photo, `${role}: com foto`).toHaveAttribute('src', PHOTO_URL);
    for (const name of ['Trocar foto', 'Usar câmera', 'Remover foto']) {
      await expect(button(page, name), `${role}: com foto: ${name}`).toBeVisible();
    }
    await expect(page.getByText(AREA), `${role}: com foto`).toHaveCount(0);
    await expect(button(page, 'Enviar foto'), `${role}: com foto`).toHaveCount(0);

    serveStaffAs(api, role, state(null));
    await page.goto(`/staff/${STAFF_ID}`);

    await expect(page.getByRole('img', { name: 'Sem foto' }), `${role}: sem foto`).toBeVisible();
    await expect(page.getByAltText(/^Foto de/), `${role}: sem foto`).toHaveCount(0);
    await expect(page.getByText(AREA), `${role}: sem foto`).toBeVisible();
    for (const name of ['Enviar foto', 'Usar câmera']) {
      await expect(button(page, name), `${role}: sem foto: ${name}`).toBeVisible();
    }
    for (const name of ['Trocar foto', 'Remover foto']) {
      await expect(button(page, name), `${role}: sem foto: ${name}`).toHaveCount(0);
    }
  }
});

test('staff_photo_file_save_posts_without_photo_and_puts_with_photo', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);
  const cases: Array<{ name: string; photoUrl: string | null; way: 'escolher' | 'largar'; button: string; method: string; other: string }> = [
    { name: 'escolher, sem foto', photoUrl: null, way: 'escolher', button: 'Enviar foto', method: 'POST', other: 'PUT' },
    { name: 'largar, sem foto', photoUrl: null, way: 'largar', button: 'Enviar foto', method: 'POST', other: 'PUT' },
    { name: 'escolher, com foto', photoUrl: PHOTO_URL, way: 'escolher', button: 'Trocar foto', method: 'PUT', other: 'POST' },
  ];

  for (const { name, photoUrl, way, button: chooser, method, other } of cases) {
    api.requests.length = 0;
    serveStaffAs(api, 'hr_finance', state(photoUrl));
    await page.goto(`/staff/${STAFF_ID}`);
    const file: TestFile = pngFile(900, 1200);

    if (way === 'escolher') await choose(page, chooser, file);
    else await dropOn(page, AREA, file);

    // escolher ou largar abre o ajuste e não envia requisição de foto
    await expect(ajustar(page), name).toBeVisible();
    expect(staffPhotoRequests(api), `${name}: antes de salvar`).toHaveLength(0);

    await saveButton(page).click();

    await expect.poll(() => staffPhotoRequests(api).length, name).toBe(1);
    expect(staffPhotoRequests(api).map((request) => request.method), name).toEqual([method]);
    expect(staffPhotoRequests(api).filter((request) => request.method === other), name).toHaveLength(0);
    await expectJpeg3by4(page, api, name);
  }
});

test('staff_photo_camera_save_posts_without_photo_and_puts_with_photo', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);
  const cases = [
    { name: 'sem foto', photoUrl: null, method: 'POST', other: 'PUT' },
    { name: 'com foto', photoUrl: PHOTO_URL, method: 'PUT', other: 'POST' },
  ];

  for (const { name, photoUrl, method, other } of cases) {
    api.requests.length = 0;
    serveStaffAs(api, 'admin', state(photoUrl));
    await page.goto(`/staff/${STAFF_ID}`);

    await button(page, 'Usar câmera').click();
    await expect(button(page, 'Capturar'), name).toBeEnabled();
    await button(page, 'Capturar').click();

    // capturar abre o ajuste e não envia requisição de foto
    await expect(ajustar(page), name).toBeVisible();
    expect(staffPhotoRequests(api), `${name}: antes de salvar`).toHaveLength(0);

    await saveButton(page).click();

    await expect.poll(() => staffPhotoRequests(api).length, name).toBe(1);
    expect(staffPhotoRequests(api).map((request) => request.method), name).toEqual([method]);
    expect(staffPhotoRequests(api).filter((request) => request.method === other), name).toHaveLength(0);
    await expectJpeg3by4(page, api, name);
  }
});

test('staff_photo_six_save_errors_show_their_messages', async ({ page, api }) => {
  serveStaffAs(api, 'hr_finance', state(null));
  const GENERIC = 'Não foi possível enviar a foto. Tente novamente.';
  const cases: Array<[status: number, reply: ReturnType<typeof problem>, message: string]> = [
    [413, problem(413, 'payload_too_large'), 'A foto deve ter no máximo 5 MB.'],
    [415, problem(415, 'unsupported_media_type'), 'Use um arquivo JPEG, PNG ou WebP.'],
    [
      422,
      problem(422, 'validation_failed', [{ path: 'file', message: 'A foto precisa ter pelo menos 300×400 pixels.' }]),
      'A foto precisa ter pelo menos 300×400 pixels.',
    ],
    [503, problem(503, 'storage_unavailable'), GENERIC],
    [500, problem(500, 'internal_error'), GENERIC],
    [409, problem(409, 'photo_exists'), 'Este funcionário já tem foto.'],
  ];

  await page.goto(`/staff/${STAFF_ID}`);
  for (const [status, reply, message] of cases) {
    api.on('POST', PHOTO_ROUTE, reply);

    await page.locator('input[type=file]').setInputFiles(pngFile(900, 1200));
    await saveButton(page).click();

    // a mensagem fica dentro do diálogo, que continua aberto
    await expect(ajustar(page).getByText(message, { exact: true }), String(status)).toBeVisible();
    await expect(ajustar(page), String(status)).toBeVisible();
    await ajustar(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(ajustar(page), String(status)).toHaveCount(0);
  }
});

test('staff_photo_remove_confirms_naming_the_staff_then_deletes', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);

  for (const role of STAFF_ROLES) {
    api.requests.length = 0;
    serveStaffAs(api, role, state(PHOTO_URL));
    const deletes = () => staffPhotoRequests(api).filter((request) => request.method === 'DELETE');

    await page.goto(`/staff/${STAFF_ID}`);
    await button(page, 'Remover foto').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog, role).toContainText(NAME);
    expect(staffPhotoRequests(api), `${role}: antes de confirmar`).toHaveLength(0);

    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog, role).toHaveCount(0);
    expect(staffPhotoRequests(api), `${role}: cancelar`).toHaveLength(0);

    await button(page, 'Remover foto').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover', exact: true }).click();

    await expect(page.getByText(AREA), role).toBeVisible();
    await expect(page.getByRole('img', { name: 'Sem foto' }), role).toBeVisible();
    await expect(page.getByAltText(/^Foto de/), role).toHaveCount(0);
    expect(staffPhotoRequests(api).map((request) => `${request.method} ${request.path}`), role).toEqual([
      `DELETE ${PHOTO_ROUTE}`,
    ]);
    expect(deletes(), role).toHaveLength(1);
    // nenhuma outra escrita de funcionário
    expect(staffRequests(api).filter((request) => request.method !== 'GET'), role).toHaveLength(1);
  }
});
