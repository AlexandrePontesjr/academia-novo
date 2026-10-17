import { readFile } from 'node:fs/promises';
import type { Role } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, type FakeApi, problem, test } from './support/fake-api.ts';
import {
  ANONYMIZE_TEXT,
  attachment,
  privacyRequests,
  STAFF_ID,
  staffAnonymizationPath,
  staffExportOf,
  staffExportPath,
  serveStaffFicha,
  serveStudentFicha,
  STUDENT_ID,
  studentAnonymizationPath,
  studentExportOf,
  studentExportPath,
} from './support/privacy.ts';

const block = (page: Page) => page.getByRole('region', { name: 'Privacidade', exact: true });
const dialog = (page: Page) => page.getByRole('dialog');
const CONTROLS = ['Exportar dados', 'Versão para impressão', 'Anonimizar'];

/** As duas fichas: onde fica, como servir e as rotas de privacidade de cada uma. */
const FICHAS = [
  {
    label: 'aluno',
    path: `/students/${STUDENT_ID}`,
    list: '/students',
    serve: serveStudentFicha,
    exportPath: studentExportPath,
    anonymizationPath: studentAnonymizationPath,
    filename: `aluno-${STUDENT_ID}.json`,
    body: studentExportOf(),
  },
  {
    label: 'funcionário',
    path: `/staff/${STAFF_ID}`,
    list: '/staff',
    serve: serveStaffFicha,
    exportPath: staffExportPath,
    anonymizationPath: staffAnonymizationPath,
    filename: `funcionario-${STAFF_ID}.json`,
    body: staffExportOf(),
  },
] as const;

/** O texto acessível de cada controle do bloco, botão ou link, na ordem da tela. */
async function controlsOf(page: Page) {
  return block(page)
    .locator('button, a')
    .evaluateAll((elements) => elements.map((element) => element.textContent?.trim() ?? ''));
}

async function openDialog(page: Page, path: string) {
  await page.goto(path);
  await block(page).getByRole('button', { name: 'Anonimizar', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}

const anonymizationPosts = (api: FakeApi, path: string) =>
  api.requests.filter((request) => request.method === 'POST' && request.path === path);

test('privacy_block_only_for_admin_on_student_and_staff_ficha', async ({ page, api }) => {
  for (const ficha of FICHAS) {
    ficha.serve(api, 'admin');
    await page.goto(ficha.path);

    await expect(block(page), ficha.label).toBeVisible();
    expect(await controlsOf(page), ficha.label).toEqual(CONTROLS);
  }

  const hidden: Array<[Role, (typeof FICHAS)[number]]> = [
    ['reception', FICHAS[0]],
    ['instructor', FICHAS[0]],
    ['hr_finance', FICHAS[0]],
    ['hr_finance', FICHAS[1]],
  ];
  for (const [role, ficha] of hidden) {
    ficha.serve(api, role);
    await page.goto(ficha.path);

    // a ficha abriu: o nome está lá, e o bloco não
    await expect(page.getByRole('heading', { level: 2 }), `${role} ${ficha.label}`).toBeVisible();
    await expect(block(page), `${role} ${ficha.label}`).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Anonimizar', exact: true }), `${role} ${ficha.label}`).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Exportar dados', exact: true }), `${role} ${ficha.label}`).toHaveCount(0);
  }
});

test('export_downloads_the_file_named_by_the_route', async ({ page, api }) => {
  for (const ficha of FICHAS) {
    ficha.serve(api, 'admin');
    api.on('GET', ficha.exportPath, attachment(ficha.body, ficha.filename));
    await page.goto(ficha.path);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      block(page).getByRole('button', { name: 'Exportar dados', exact: true }).click(),
    ]);

    expect(download.suggestedFilename(), ficha.label).toBe(ficha.filename);
    const saved = await download.path();
    expect(JSON.parse(await readFile(saved, 'utf8')), ficha.label).toEqual(ficha.body);
  }
});

test('anonymize_dialog_text_and_cancel_sends_nothing', async ({ page, api }) => {
  for (const ficha of FICHAS) {
    ficha.serve(api, 'admin');
    api.requests = [];
    await openDialog(page, ficha.path);

    await expect(dialog(page).getByText(ANONYMIZE_TEXT, { exact: true }), ficha.label).toBeVisible();
    expect(await dialog(page).getByRole('button').allTextContents(), ficha.label).toEqual(
      expect.arrayContaining(['Cancelar', 'Anonimizar']),
    );
    await dialog(page).getByRole('button', { name: 'Cancelar', exact: true }).click();

    await expect(dialog(page), ficha.label).toHaveCount(0);
    expect(anonymizationPosts(api, ficha.anonymizationPath), ficha.label).toEqual([]);
    expect(api.writes(), ficha.label).toEqual([]);
  }
});

test('after_204_goes_to_list_with_titular_anonimizado', async ({ page, api }) => {
  for (const ficha of FICHAS) {
    ficha.serve(api, 'admin');
    api.on('POST', ficha.anonymizationPath, { status: 204 });
    await openDialog(page, ficha.path);

    await dialog(page).getByRole('button', { name: 'Anonimizar', exact: true }).click();

    await expect(page, ficha.label).toHaveURL(new RegExp(`${ficha.list}(\\?|$)`));
    await expect(page.getByText('Titular anonimizado.', { exact: true }), ficha.label).toBeVisible();
    expect(anonymizationPosts(api, ficha.anonymizationPath), ficha.label).toHaveLength(1);
  }
});

test('anonymize_failure_messages_by_code_five_cases', async ({ page, api }) => {
  const cases = [
    ['409 subject_not_inactive', problem(409, 'subject_not_inactive'), 'Inative o cadastro antes de anonimizar.'],
    ['409 subject_has_open_periods', problem(409, 'subject_has_open_periods'), 'Cancele ou confirme os períodos em aberto antes de anonimizar.'],
    ['409 staff_user_linked', problem(409, 'staff_user_linked'), 'Desvincule o usuário antes de anonimizar.'],
    ['503 storage_unavailable', problem(503, 'storage_unavailable'), 'Armazenamento de fotos indisponível. Tente de novo.'],
    ['500', problem(500, 'internal_error'), 'Não foi possível anonimizar.'],
  ] as const;
  expect(cases).toHaveLength(5);

  for (const ficha of FICHAS) {
    for (const [label, reply, message] of cases) {
      ficha.serve(api, 'admin');
      api.on('POST', ficha.anonymizationPath, reply);
      await openDialog(page, ficha.path);

      await dialog(page).getByRole('button', { name: 'Anonimizar', exact: true }).click();

      await expect(dialog(page).getByText(message, { exact: true }), `${ficha.label} ${label}`).toBeVisible();
      await expect(dialog(page), `${ficha.label} ${label}`).toBeVisible();
      await expect(page, `${ficha.label} ${label}`).toHaveURL(ficha.path);
    }
  }
});

test('non_admin_ficha_requests_no_privacy_route', async ({ page, api }) => {
  for (const role of ['reception', 'hr_finance'] as Role[]) {
    serveStudentFicha(api, role);
    api.requests = [];

    await page.goto(FICHAS[0].path);

    await expect(page.getByRole('heading', { level: 2 }), role).toBeVisible();
    await page.waitForTimeout(500);
    expect(privacyRequests(api), role).toEqual([]);
  }
});

test('anonymize_button_disabled_while_pending_and_single_post', async ({ page, api }) => {
  for (const ficha of FICHAS) {
    ficha.serve(api, 'admin');
    api.on('POST', ficha.anonymizationPath, 'hang');
    api.requests = [];
    await openDialog(page, ficha.path);
    const confirm = dialog(page).getByRole('button', { name: 'Anonimizar', exact: true });

    await confirm.click();

    await expect(confirm, ficha.label).toBeDisabled();
    await confirm.click({ force: true });
    await page.waitForTimeout(500);
    expect(anonymizationPosts(api, ficha.anonymizationPath), ficha.label).toHaveLength(1);
  }
});
