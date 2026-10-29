import type { StaffRole, Student } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, problem, sessionOf, test } from './support/fake-api.ts';
import { leadOf, listCalls, serveLeads } from './support/leads.ts';
import { formHydrated } from './support/motion.ts';

/**
 * A prova da tela "Interessados" (`.specs/features/pre-cadastro`, S6): a lista, o filtro, os rótulos,
 * os estados, as ações por situação e por perfil e a conversão pelo cadastro do aluno.
 */

const COLUMNS = ['Nome', 'E-mail', 'Telefone', 'Origem', 'E-mail confirmado', 'Recebido em', 'Situação'];

const rowOf = (page: Page, id: string) => page.locator(`tr[data-lead="${id}"]`);
/** O texto das sete células da linha; a da situação, sem os botões que moram nela. */
async function cellsOf(page: Page, id: string) {
  const texts = (await rowOf(page, id).locator('td').allInnerTexts()).map((text) => text.trim());
  return [...texts.slice(0, 6), (await statusOf(page, id).innerText()).trim()];
}
const statusOf = (page: Page, id: string) => rowOf(page, id).locator('[data-slot="lead-status"]');

async function openLeads(page: Page, path = '/leads') {
  await page.goto(path);
  await page.getByRole('heading', { name: 'Interessados', exact: true }).waitFor();
}

test('title_filter_and_seven_columns', async ({ page, api }) => {
  api.session = sessionOf('reception');
  serveLeads(api, [leadOf()]);
  await openLeads(page);

  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Interessados');
  const filter = page.getByLabel('Situação', { exact: true });
  await expect(filter.locator('option')).toHaveText(['Em aberto', 'Novo', 'Contatado', 'Matriculado', 'Descartado']);
  await expect(filter).toHaveValue('');
  await expect(filter.locator('option:checked')).toHaveText('Em aberto');
  // o texto do cabeçalho, não a caixa alta que o CSS dá a ele
  const headers = (await page.locator('thead th').allTextContents()).map((text) => text.trim());
  expect(headers).toEqual(COLUMNS);
  expect(listCalls(api)[0]).toBe('');
});

test('filter_sends_each_status', async ({ page, api }) => {
  api.session = sessionOf('admin');
  const leads = serveLeads(api, [
    leadOf({ status: 'new', name: 'Pessoa Nova' }),
    leadOf({ status: 'contacted', name: 'Pessoa Contatada' }),
    leadOf({ status: 'converted', name: 'Pessoa Matriculada', studentId: '018f0000-0000-7000-8000-000000000601' }),
    leadOf({ status: 'discarded', name: 'Pessoa Descartada' }),
  ]);
  await openLeads(page);
  await page.locator('main select').waitFor();

  for (const [status, label] of [
    ['new', 'Novo'],
    ['contacted', 'Contatado'],
    ['converted', 'Matriculado'],
    ['discarded', 'Descartado'],
  ] as const) {
    await page.getByLabel('Situação', { exact: true }).selectOption({ label });
    await expect(page).toHaveURL(`/leads?status=${status}`);
    const expected = leads.find((lead) => lead.status === status)!;
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(rowOf(page, expected.id)).toContainText(expected.name);
    expect(listCalls(api)).toContain(`status=${status}`);
  }
});

test('labels_and_sao_paulo_datetime', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const form = leadOf({ source: 'form', emailVerified: false, createdAt: '2026-10-22T13:05:00Z', status: 'new' });
  const google = leadOf({ source: 'google', emailVerified: true, createdAt: '2026-10-23T02:30:00Z', status: 'contacted' });
  const converted = leadOf({ status: 'converted', studentId: '018f0000-0000-7000-8000-000000000601' });
  const discarded = leadOf({ status: 'discarded' });
  serveLeads(api, [form, google, converted, discarded]);
  await openLeads(page);

  expect((await cellsOf(page, form.id)).slice(3, 7)).toEqual(['Formulário', 'Não', '22/10/2026 10:05', 'Novo']);
  expect((await cellsOf(page, google.id)).slice(3, 7)).toEqual(['Google', 'Sim', '22/10/2026 23:30', 'Contatado']);

  await openLeads(page, '/leads?status=converted');
  await expect(statusOf(page, converted.id)).toHaveText('Matriculado');
  await openLeads(page, '/leads?status=discarded');
  await expect(statusOf(page, discarded.id)).toHaveText('Descartado');
});

test('empty_state', async ({ page, api }) => {
  api.session = sessionOf('reception');
  serveLeads(api, []);
  for (const path of ['/leads', '/leads?status=discarded']) {
    await openLeads(page, path);
    await expect(page.getByText('Nenhum interessado.', { exact: true }), path).toBeVisible();
    await expect(page.locator('table'), path).toHaveCount(0);
  }
});

test('load_error_and_retry', async ({ page, api }) => {
  api.session = sessionOf('hr_finance');
  api.on('GET', '/api/leads', problem(500, 'internal_error'));
  await openLeads(page);

  await expect(page.getByText('Não foi possível carregar os interessados.', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Tentar novamente', exact: true });
  await expect(retry).toBeVisible();

  const lead = leadOf({ name: 'Volta Depois' });
  serveLeads(api, [lead]);
  await retry.click();
  await expect(rowOf(page, lead.id)).toContainText('Volta Depois');
});

test('no_session_redirects_and_instructor_denied', async ({ page, api }) => {
  await page.goto('/leads');
  await expect(page).toHaveURL('/login');

  api.session = sessionOf('instructor');
  serveLeads(api, [leadOf({ name: 'Não Aparece' })]);
  await openLeads(page);
  await expect(page.getByText('Você não tem permissão para acessar esta página.', { exact: true })).toBeVisible();
  await expect(page.getByText('Não Aparece')).toHaveCount(0);
  expect(listCalls(api)).toEqual([]);
});

test('row_buttons_by_status_and_role', async ({ page, api }) => {
  const fresh = leadOf({ status: 'new' });
  const contacted = leadOf({ status: 'contacted' });
  const discarded = leadOf({ status: 'discarded' });
  const converted = leadOf({ status: 'converted', studentId: '018f0000-0000-7000-8000-000000000601' });
  serveLeads(api, [fresh, contacted, discarded, converted]);
  const buttons = async (id: string) =>
    (await rowOf(page, id).locator('button, a').allInnerTexts()).map((text) => text.trim()).sort();

  // RH/Financeiro vê e marca, mas não cadastra aluno: sem "Matricular" (corrigido pelo usuário em 2026-10-23)
  const expected: Record<StaffRole, Record<string, string[]>> = {
    hr_finance: {
      [fresh.id]: ['Descartar', 'Marcar contatado'],
      [contacted.id]: ['Descartar'],
    },
    admin: {
      [fresh.id]: ['Descartar', 'Marcar contatado', 'Matricular'],
      [contacted.id]: ['Descartar', 'Matricular'],
    },
    reception: {
      [fresh.id]: ['Descartar', 'Marcar contatado', 'Matricular'],
      [contacted.id]: ['Descartar', 'Matricular'],
    },
    instructor: {},
  };
  for (const role of ['hr_finance', 'admin', 'reception'] as const) {
    api.session = sessionOf(role);
    await openLeads(page);
    for (const [id, names] of Object.entries(expected[role])) expect(await buttons(id), `${role} ${id}`).toEqual(names);
    await openLeads(page, '/leads?status=discarded');
    expect(await buttons(discarded.id), `${role} discarded`).toEqual(['Reabrir']);
    await openLeads(page, '/leads?status=converted');
    expect(await buttons(converted.id), `${role} converted`).toEqual([]);
  }
});

test('status_actions_and_discard_confirmation', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const fresh = leadOf({ status: 'new', name: 'Clara Nunes' });
  const other = leadOf({ status: 'new', name: 'Davi Rocha' });
  const discarded = leadOf({ status: 'discarded', name: 'Elis Prado' });
  serveLeads(api, [fresh, other, discarded]);
  const patches = () => api.writes().map((request) => ({ method: request.method, path: request.path, body: request.body }));
  await openLeads(page);
  await page.locator('main select').waitFor();

  await rowOf(page, fresh.id).getByRole('button', { name: 'Marcar contatado', exact: true }).click();
  await expect(statusOf(page, fresh.id)).toHaveText('Contatado');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(patches()).toEqual([{ method: 'PATCH', path: `/api/leads/${fresh.id}`, body: { status: 'contacted' } }]);

  await rowOf(page, other.id).getByRole('button', { name: 'Descartar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Davi Rocha');
  await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(patches()).toHaveLength(1);

  await rowOf(page, other.id).getByRole('button', { name: 'Descartar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(statusOf(page, other.id)).toHaveText('Descartado');
  expect(patches()[1]).toEqual({ method: 'PATCH', path: `/api/leads/${other.id}`, body: { status: 'discarded' } });

  await openLeads(page, '/leads?status=discarded');
  await rowOf(page, discarded.id).getByRole('button', { name: 'Reabrir', exact: true }).click();
  await expect(statusOf(page, discarded.id)).toHaveText('Novo');
  expect(patches()[2]).toEqual({ method: 'PATCH', path: `/api/leads/${discarded.id}`, body: { status: 'new' } });
});

test('matricular_prefills_student_form_and_sends_lead_id', async ({ page, api }) => {
  api.session = sessionOf('admin');
  const lead = leadOf({ name: 'Fábio Lima', email: 'fabio@example.com', phone: '11987654321' });
  serveLeads(api, [lead]);
  const created = { id: '018f0000-0000-7000-8000-000000000611', name: 'Fábio Lima' } as Student;
  api.on('POST', '/api/students', { status: 201, body: created });
  await openLeads(page);

  await rowOf(page, lead.id).getByRole('link', { name: 'Matricular', exact: true }).click();
  await expect(page).toHaveURL(`/students/new?lead=${lead.id}`);
  await formHydrated(page);
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue('Fábio Lima');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('fabio@example.com');
  await expect(page.getByLabel('Telefone', { exact: true })).toHaveValue('(11) 98765-4321');

  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByLabel('Data de nascimento', { exact: true }).fill('2000-01-01');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => api.writes().length).toBe(1);
  expect(api.writes()[0]).toMatchObject({ method: 'POST', path: '/api/students' });
  expect((api.writes()[0]!.body as { leadId?: string }).leadId).toBe(lead.id);

  // sem `lead` na URL, o corpo não leva `leadId`
  api.requests = [];
  await page.goto('/students/new');
  await formHydrated(page);
  await page.getByLabel('Nome completo', { exact: true }).fill('Outra Pessoa');
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByLabel('Data de nascimento', { exact: true }).fill('2000-01-01');
  await page.getByLabel('Telefone', { exact: true }).fill('(11) 91234-5678');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => api.writes().length).toBe(1);
  expect(api.writes()[0]!.body).not.toHaveProperty('leadId');
});

test('conflict_messages', async ({ page, api }) => {
  api.session = sessionOf('admin');
  const discarded = leadOf({ status: 'discarded' });
  const open = leadOf({ status: 'new' });
  serveLeads(api, [discarded, open]);
  api.on('PATCH', `/api/leads/${discarded.id}`, problem(409, 'lead_email_open'));
  await openLeads(page, '/leads?status=discarded');
  await page.locator('main select').waitFor();
  await rowOf(page, discarded.id).getByRole('button', { name: 'Reabrir', exact: true }).click();
  await expect(rowOf(page, discarded.id)).toContainText('Já existe um pré-cadastro em aberto com este e-mail.');

  api.on('POST', '/api/students', problem(409, 'lead_converted'));
  await page.goto(`/students/new?lead=${open.id}`);
  await formHydrated(page);
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByLabel('Data de nascimento', { exact: true }).fill('2000-01-01');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Este interessado já foi matriculado.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue(open.name);
  await expect(page.getByLabel('CPF', { exact: true })).toHaveValue('529.982.247-25');
  await expect(page).toHaveURL(`/students/new?lead=${open.id}`);
});
