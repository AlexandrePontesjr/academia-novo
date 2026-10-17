import type { Page } from '@playwright/test';
import { expect, problem, test } from './support/fake-api.ts';
import { spaced } from './support/plans.ts';
import {
  attachment,
  IMAGE,
  IMAGE_2,
  serveStaffFicha,
  serveStudentFicha,
  STAFF_ID,
  staffExportOf,
  staffExportPath,
  STUDENT_ID,
  studentExportOf,
  studentExportPath,
} from './support/privacy.ts';

const STUDENT_PRINT = `/students/${STUDENT_ID}/print`;
const STAFF_PRINT = `/staff/${STAFF_ID}/print`;
const STUDENT_SECTIONS = ['Dados pessoais', 'Responsáveis', 'Consentimentos', 'Matrículas', 'Pagamentos', 'Presenças', 'Fotos'];

const section = (page: Page, title: string) => page.getByRole('region', { name: title, exact: true });
const sectionText = async (page: Page, title: string) => spaced((await section(page, title).textContent()) ?? '');

/** Conta as chamadas a `window.print` sem abrir o diálogo de impressão. */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed += 1;
    };
  });
}

test('student_print_sections_dates_photos_empty_and_print_button', async ({ page, api }) => {
  serveStudentFicha(api, 'admin');
  api.on('GET', studentExportPath, attachment(studentExportOf(), `aluno-${STUDENT_ID}.json`));
  await stubPrint(page);

  await page.goto(STUDENT_PRINT);

  const titles = await page.locator('section[aria-labelledby] > h3').allTextContents();
  expect(titles).toEqual(STUDENT_SECTIONS);
  const personal = await sectionText(page, 'Dados pessoais');
  for (const value of ['Rafaela Prado Cunha', '529.982.247-25', '30/11/1990', 'Feminino', 'rafaela@exemplo.com', '(11) 98765-4321', 'Rua das Acácias, 120', 'Maria da Penha', 'Hipertensão controlada.', 'Inativo']) {
    expect(personal, value).toContain(value);
  }
  expect(await sectionText(page, 'Responsáveis')).toContain('Joana Prado');
  expect(await sectionText(page, 'Responsáveis')).toContain('Mãe');
  expect(await sectionText(page, 'Consentimentos')).toContain('Autorizo o uso da minha imagem.');
  const enrollments = await sectionText(page, 'Matrículas');
  for (const value of ['Mensal Plus', '01/08/2026', '31/08/2026', 'R$ 99,90']) expect(enrollments, value).toContain(value);
  expect(await sectionText(page, 'Pagamentos')).toContain('01/08/2026');
  expect(await sectionText(page, 'Presenças')).toContain('05/08/2026');
  // nenhuma data `aaaa-mm-dd` sobra na página
  expect(spaced((await page.locator('main').textContent()) ?? '')).not.toMatch(/\d{4}-\d{2}-\d{2}/);

  const images = section(page, 'Fotos').locator('img');
  await expect(images).toHaveCount(2);
  expect(await images.evaluateAll((elements) => elements.map((element) => element.getAttribute('src')))).toEqual([IMAGE, IMAGE_2]);

  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  // cada coleção vazia diz "Nenhum registro."
  api.on(
    'GET',
    studentExportPath,
    attachment(studentExportOf({ guardians: [], consents: [], enrollments: [], payments: [], checkIns: [], photos: [] }), `aluno-${STUDENT_ID}.json`),
  );
  await page.goto(STUDENT_PRINT);
  for (const title of STUDENT_SECTIONS.slice(1)) {
    await expect(section(page, title).getByText('Nenhum registro.', { exact: true }), title).toBeVisible();
  }
  await expect(section(page, 'Dados pessoais').getByText('Nenhum registro.', { exact: true })).toHaveCount(0);
});

test('export_failure_shows_message_and_retry_on_print_and_download', async ({ page, api }) => {
  // na versão para impressão
  serveStudentFicha(api, 'admin');
  api.on('GET', studentExportPath, problem(500, 'internal_error'));
  await page.goto(STUDENT_PRINT);

  await expect(page.getByText('Não foi possível exportar os dados.', { exact: true })).toBeVisible();
  const exportsBefore = api.requests.filter((request) => request.path === studentExportPath).length;
  api.on('GET', studentExportPath, attachment(studentExportOf(), `aluno-${STUDENT_ID}.json`));
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(section(page, 'Dados pessoais')).toBeVisible();
  expect(api.requests.filter((request) => request.path === studentExportPath).length).toBeGreaterThan(exportsBefore);

  // no download da ficha
  api.on('GET', studentExportPath, problem(500, 'internal_error'));
  await page.goto(`/students/${STUDENT_ID}`);
  const block = page.getByRole('region', { name: 'Privacidade', exact: true });
  await block.getByRole('button', { name: 'Exportar dados', exact: true }).click();
  await expect(block.getByText('Não foi possível exportar os dados.', { exact: true })).toBeVisible();

  api.on('GET', studentExportPath, attachment(studentExportOf(), `aluno-${STUDENT_ID}.json`));
  const before = api.requests.filter((request) => request.path === studentExportPath).length;
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    block.getByRole('button', { name: 'Tentar novamente', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`aluno-${STUDENT_ID}.json`);
  expect(api.requests.filter((request) => request.path === studentExportPath)).toHaveLength(before + 1);
  await expect(block.getByText('Não foi possível exportar os dados.', { exact: true })).toHaveCount(0);
});

test('markup_in_export_shown_as_literal_text', async ({ page, api }) => {
  const MARKUP = '<b>x</b>';
  serveStudentFicha(api, 'admin');
  const data = studentExportOf({}, { name: `Rafaela ${MARKUP}`, healthNotes: `Saúde ${MARKUP}` });
  data.consents[0]!.termText = `Termo ${MARKUP}`;
  data.enrollments[0]!.planName = `Plano ${MARKUP}`;
  api.on('GET', studentExportPath, attachment(data, `aluno-${STUDENT_ID}.json`));

  await page.goto(STUDENT_PRINT);

  for (const literal of [`Rafaela ${MARKUP}`, `Saúde ${MARKUP}`, `Termo ${MARKUP}`, `Plano ${MARKUP}`]) {
    await expect(page.locator('main').getByText(literal, { exact: true }).first(), literal).toBeVisible();
  }
  await expect(page.locator('main b')).toHaveCount(0);
});

test('staff_print_sections_user_and_photos', async ({ page, api }) => {
  serveStaffFicha(api, 'admin');
  api.on('GET', staffExportPath, attachment(staffExportOf(), `funcionario-${STAFF_ID}.json`));
  await stubPrint(page);

  await page.goto(STAFF_PRINT);

  expect(await page.locator('section[aria-labelledby] > h3').allTextContents()).toEqual(['Dados pessoais', 'Usuário', 'Fotos']);
  const personal = await sectionText(page, 'Dados pessoais');
  for (const value of ['Rafaela Prado Cunha', '529.982.247-25', 'Fisioterapeuta Esportiva', 'Reabilitação', '15/03/2021', '(11) 91234-5678']) {
    expect(personal, value).toContain(value);
  }
  const user = await sectionText(page, 'Usuário');
  expect(user).toContain('rafaela.usuario@exemplo.com');
  expect(user).toContain('Instrutor');
  expect(await section(page, 'Fotos').locator('img').evaluateAll((elements) => elements.map((element) => element.getAttribute('src')))).toEqual([IMAGE]);
  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  // sem usuário vinculado
  api.on('GET', staffExportPath, attachment(staffExportOf({ user: null }), `funcionario-${STAFF_ID}.json`));
  await page.goto(STAFF_PRINT);
  await expect(section(page, 'Usuário').getByText('Sem usuário vinculado.', { exact: true })).toBeVisible();
});
