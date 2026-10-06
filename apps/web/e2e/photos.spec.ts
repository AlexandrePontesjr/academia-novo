import type { Role, StudentListItem } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, problem, servePhotoFile, sessionOf, test } from './support/fake-api.ts';
import {
  ajustar,
  ID,
  PHOTO_ID,
  PHOTO_PATH,
  PHOTO_URL,
  pngFile,
  serveFicha,
  serveMutableFicha,
  studentOf,
  WRITERS,
} from './support/photo.ts';

const THUMB_PATH = `/api/photo-files/${PHOTO_ID}/thumb`;
const THUMB_URL = `${THUMB_PATH}?exp=2000000000&sig=assinatura`;

const ROLES: Role[] = ['admin', 'reception', 'hr_finance', 'instructor'];

/** As iniciais que o círculo mostra: ficam num pseudo-elemento, para não entrar no texto da célula. */
const initialsShown = (page: Page) =>
  page.getByRole('img', { name: 'Sem foto' }).evaluate((element) => getComputedStyle(element, '::before').content);

test('ficha_shows_photo_with_alt_text', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);
  serveFicha(api, 'reception', studentOf({ photoUrl: PHOTO_URL }));

  await page.goto(`/students/${ID}`);

  const photo = page.getByRole('img', { name: 'Foto de Marina Duarte' });
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute('src', PHOTO_URL);
});

test('initials_circle_for_five_names_labelled_sem_foto', async ({ page, api }) => {
  const cases: Array<[name: string, initials: string]> = [
    ['João da Silva', 'JS'],
    ['Maria', 'M'],
    ['ana de souza', 'AS'],
    [' Ana  Souza ', 'AS'],
    ['Érica Álvares', 'ÉÁ'],
  ];

  for (const [name, initials] of cases) {
    serveFicha(api, 'reception', studentOf({ name, photoUrl: null }));

    await page.goto(`/students/${ID}`);

    await expect(page.getByRole('img', { name: 'Sem foto' }), name).toBeVisible();
    expect(await initialsShown(page), name).toBe(`"${initials}"`);
  }
});

test('broken_image_falls_back_to_initials_on_ficha_and_list', async ({ page, api }) => {
  // a API falsa responde 404 ao arquivo: a imagem não carrega
  const student = studentOf({ photoUrl: PHOTO_URL });
  serveFicha(api, 'reception', student);
  api.on('GET', '/api/students', {
    status: 200,
    body: { items: [{ id: ID, name: student.name, status: 'active', cpf: student.cpf, phone: student.phone, photoUrl: THUMB_URL }], nextCursor: null },
  });

  await page.goto(`/students/${ID}`);
  await expect(page.getByRole('img', { name: 'Sem foto' })).toBeVisible();
  await expect(page.getByAltText(/^Foto de/)).toHaveCount(0);

  await page.goto('/students');
  const cell = page.locator('tbody tr td:nth-child(1)');
  await expect(cell.getByRole('img', { name: 'Sem foto' })).toBeVisible();
  await expect(cell.locator('img')).toHaveCount(0);
});

test('six_upload_errors_show_their_messages_and_keep_the_form', async ({ page, api }) => {
  serveFicha(api, 'reception', studentOf({ photoUrl: null }));
  const GENERIC = 'Não foi possível enviar a foto. Tente novamente.';
  const cases: Array<[status: number, reply: ReturnType<typeof problem>, message: string]> = [
    [413, problem(413, 'payload_too_large'), 'A foto deve ter no máximo 5 MB.'],
    [415, problem(415, 'unsupported_media_type'), 'Use um arquivo JPEG, PNG ou WebP.'],
    [
      422,
      problem(422, 'validation_failed', [{ path: 'file', message: 'A foto precisa ter pelo menos 300×400 pixels.' }]),
      'A foto precisa ter pelo menos 300×400 pixels.',
    ],
    [409, problem(409, 'photo_exists'), 'Este aluno já tem foto.'],
    [503, problem(503, 'storage_unavailable'), GENERIC],
    [500, problem(500, 'internal_error'), GENERIC],
  ];

  await page.goto(`/students/${ID}`);
  for (const [status, reply, message] of cases) {
    api.on('POST', `/api/students/${ID}/photo`, reply);

    // todo arquivo passa pelo ajuste (foto-captura): o envio sai de "Salvar foto", e a mensagem fica no diálogo
    await page.locator('input[type=file]').setInputFiles(pngFile(900, 1200));
    await ajustar(page).getByRole('button', { name: 'Salvar foto', exact: true }).click();

    await expect(page.getByText(message, { exact: true }), String(status)).toBeVisible();
    await ajustar(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByText('Arraste uma foto aqui ou escolha um arquivo'), String(status)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar foto' }), String(status)).toBeEnabled();
  }
});

test('remove_photo_confirms_naming_the_student_then_deletes', async ({ page, api }) => {
  for (const role of WRITERS) {
    api.requests.length = 0;
    const state = { photoUrl: PHOTO_URL as string | null };
    serveMutableFicha(api, role, state);
    servePhotoFile(api, PHOTO_PATH);
    api.on('DELETE', `/api/students/${ID}/photo`, () => {
      state.photoUrl = null;
      return { status: 204 };
    });
    const deletes = () => api.requests.filter((request) => request.method === 'DELETE');

    await page.goto(`/students/${ID}`);
    await page.getByRole('button', { name: 'Remover foto' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog, role).toContainText('Marina Duarte');
    expect(deletes(), `${role}: antes de confirmar`).toHaveLength(0);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog, role).toHaveCount(0);
    expect(deletes(), `${role}: cancelar`).toHaveLength(0);

    await page.getByRole('button', { name: 'Remover foto' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover', exact: true }).click();

    await expect(page.getByText('Arraste uma foto aqui ou escolha um arquivo'), role).toBeVisible();
    expect(deletes(), role).toHaveLength(1);
    expect(deletes()[0]!.path).toBe(`/api/students/${ID}/photo`);
    await expect(page.getByAltText(/^Foto de/), role).toHaveCount(0);
  }
});

test('read_only_profiles_see_photo_or_initials_without_controls', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);

  for (const role of ['hr_finance', 'instructor'] as Role[]) {
    for (const photoUrl of [PHOTO_URL, null]) {
      serveFicha(api, role, studentOf({ photoUrl }));

      await page.goto(`/students/${ID}`);

      const shown = photoUrl ? page.getByRole('img', { name: 'Foto de Marina Duarte' }) : page.getByRole('img', { name: 'Sem foto' });
      await expect(shown, `${role} ${photoUrl}`).toBeVisible();
      for (const control of ['Enviar foto', 'Remover foto']) {
        await expect(page.getByRole('button', { name: control }), `${role} ${photoUrl}: ${control}`).toHaveCount(0);
      }
      await expect(page.getByText('Arraste uma foto aqui ou escolha um arquivo'), `${role} ${photoUrl}`).toHaveCount(0);
    }
  }
});

test('list_cell_name_has_thumbnail_or_initials_for_four_roles', async ({ page, api }) => {
  servePhotoFile(api, THUMB_PATH);
  const withContact = (role: Role) => role !== 'instructor';
  const itemsFor = (role: Role): StudentListItem[] =>
    [
      { id: '018f0000-0000-7000-8000-000000000311', name: 'Com Foto', photoUrl: THUMB_URL },
      { id: '018f0000-0000-7000-8000-000000000312', name: 'Sem Foto', photoUrl: null },
    ].map((item) => ({
      ...item,
      status: 'active' as const,
      ...(withContact(role) && { cpf: '52998224725', phone: '11912345678' }),
    }));

  for (const role of ROLES) {
    api.session = sessionOf(role);
    api.on('GET', '/api/students', { status: 200, body: { items: itemsFor(role), nextCursor: null } });

    await page.goto('/students');

    expect(await page.getByRole('columnheader').allTextContents(), role).toEqual(
      withContact(role) ? ['Nome', 'CPF', 'Telefone', 'Situação'] : ['Nome', 'Situação'],
    );
    const rows = page.locator('tbody tr td:nth-child(1)');
    const [withPhoto, without] = [rows.nth(0), rows.nth(1)];
    await expect(withPhoto.locator('img'), role).toHaveAttribute('src', THUMB_URL);
    await expect(without.getByRole('img', { name: 'Sem foto' }), role).toBeVisible();
    for (const [cell, name, id] of [
      [withPhoto, 'Com Foto', '018f0000-0000-7000-8000-000000000311'],
      [without, 'Sem Foto', '018f0000-0000-7000-8000-000000000312'],
    ] as const) {
      // a miniatura ou o círculo vem antes do nome, e o nome segue levando à ficha
      const avatarBeforeName = await cell.evaluate((element) => {
        const avatar = element.querySelector('img, [aria-label="Sem foto"]');
        const link = element.querySelector('a');
        return Boolean(avatar && link && avatar.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(avatarBeforeName, `${role} ${name}`).toBe(true);
      await expect(cell.getByRole('link', { name, exact: true }), role).toHaveAttribute('href', `/students/${id}`);
    }
  }
});
