import type { Consent, ConsentPurpose, Guardian, GuardianRelationship, Role, Student } from '@academia/contracts';
import type { Page } from '@playwright/test';
import {
  type ConsentsState,
  expect,
  type FakeApi,
  problem,
  serveConsents,
  sessionOf,
  termsOf,
  test,
} from './support/fake-api.ts';

const NOW = '2026-10-05T02:30:00.000Z'; // 23:30 de 4/10 em São Paulo
const TEN_YEARS_AGO = `${new Date().getFullYear() - 10}-01-01`;

let counter = 0;
function studentOf(overrides: Partial<Student> = {}): Student {
  counter += 1;
  return {
    id: `018f0000-0000-7000-8000-0000000006${String(counter).padStart(2, '0')}`,
    name: `Aluna ${counter}`,
    status: 'active',
    cpf: '12345678909',
    birthDate: '1990-11-30',
    sex: 'female',
    email: null,
    phone: '11987654321',
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    healthNotes: null,
    ...overrides,
  };
}
const minorOf = (overrides: Partial<Student> = {}) => studentOf({ birthDate: TEN_YEARS_AGO, ...overrides });

const guardianOf = (overrides: Partial<Guardian> = {}): Guardian => ({
  id: '018f0000-0000-7000-8000-0000000003aa',
  name: 'Ana Souza',
  cpf: '52998224725',
  phone: '11912345678',
  relationship: 'mother',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

let consentCounter = 0;
function consentOf(purpose: ConsentPurpose, overrides: Partial<Consent> = {}): Consent {
  consentCounter += 1;
  return {
    id: `018f0000-0000-7000-8000-0000000008${String(consentCounter).padStart(2, '0')}`,
    purpose,
    termVersion: 1,
    grantedBy: 'student',
    guardian: null,
    grantedAt: NOW,
    revokedAt: null,
    ...overrides,
  };
}

const stateOf = (overrides: Partial<ConsentsState> = {}): ConsentsState => ({
  guardian: null,
  items: [],
  terms: termsOf(),
  now: NOW,
  ...overrides,
});

/** A API falsa serve a ficha do aluno e o estado de consentimentos dele, para o perfil dado. */
function serve(api: FakeApi, student: Student, state: ConsentsState, role: Role = 'reception') {
  api.session = sessionOf(role);
  api.on('GET', `/api/students/${student.id}`, { status: 200, body: student });
  serveConsents(api, student.id, state);
}

const block = (page: Page) => page.getByRole('region', { name: 'Responsável e consentimentos', exact: true });
const purposeRegion = (page: Page, label: string) => block(page).getByRole('region', { name: label, exact: true });
const consentCalls = (api: FakeApi) =>
  api.requests.filter((request) => request.path.includes('/consents') || request.path === '/api/consent-terms');

test('ficha_block_shows_guardian_or_none', async ({ page, api }) => {
  const labels: Array<[GuardianRelationship, string]> = [
    ['mother', 'Mãe'],
    ['father', 'Pai'],
    ['legal_guardian', 'Responsável legal'],
    ['other', 'Outro'],
  ];
  for (const role of ['admin', 'reception'] as Role[]) {
    for (const [relationship, label] of labels) {
      const student = studentOf();
      serve(api, student, stateOf({ guardian: guardianOf({ relationship }) }), role);

      await page.goto(`/students/${student.id}`);

      const region = block(page);
      await expect(region, `${role} ${label}`).toBeVisible();
      await expect(region.getByText('Ana Souza', { exact: true }), `${role} ${label}`).toBeVisible();
      await expect(region.getByText('529.982.247-25', { exact: true }), `${role} ${label}`).toBeVisible();
      await expect(region.getByText('(11) 91234-5678', { exact: true }), `${role} ${label}`).toBeVisible();
      await expect(region.getByText(label, { exact: true }), `${role} ${label}`).toBeVisible();
    }
    const alone = studentOf();
    serve(api, alone, stateOf(), role);
    await page.goto(`/students/${alone.id}`);
    await expect(block(page).getByText('Nenhum responsável cadastrado.', { exact: true }), role).toBeVisible();
  }
});

test('ficha_block_shows_pending_guardian_for_minor_only', async ({ page, api }) => {
  const pending = 'Responsável pendente: edite o aluno para cadastrar o responsável legal.';

  const minor = minorOf();
  serve(api, minor, stateOf());
  await page.goto(`/students/${minor.id}`);
  await expect(block(page).getByText(pending, { exact: true }), 'menor sem responsável').toBeVisible();

  const adult = studentOf();
  serve(api, adult, stateOf());
  await page.goto(`/students/${adult.id}`);
  await expect(block(page).getByText('Nenhum responsável cadastrado.', { exact: true }), 'adulto').toBeVisible();
  await expect(page.getByText(pending), 'adulto sem texto de pendência').toHaveCount(0);

  const covered = minorOf();
  serve(api, covered, stateOf({ guardian: guardianOf() }));
  await page.goto(`/students/${covered.id}`);
  await expect(block(page).getByText('Ana Souza', { exact: true })).toBeVisible();
  await expect(page.getByText(pending), 'menor com responsável').toHaveCount(0);
});

test('ficha_shows_three_states_for_each_purpose', async ({ page, api }) => {
  const purposes: Array<[ConsentPurpose, string]> = [
    ['data_processing', 'Uso de dados pessoais'],
    ['image_use', 'Uso da imagem'],
  ];
  for (const [purpose, label] of purposes) {
    const cases: Array<[string, Consent[], string]> = [
      ['ativo', [consentOf(purpose)], 'Consentido, versão 1, em 04/10/2026'],
      ['só revogados', [consentOf(purpose, { revokedAt: NOW })], 'Revogado em 04/10/2026'],
      ['nenhum', [], 'Pendente'],
    ];
    for (const [name, items, expected] of cases) {
      const student = studentOf();
      serve(api, student, stateOf({ items }));

      await page.goto(`/students/${student.id}`);

      await expect(purposeRegion(page, label), `${label} ${name}`).toContainText(expected);
    }
    // um revogado e um ativo da mesma finalidade: vale o ativo
    const both = studentOf();
    serve(
      api,
      both,
      stateOf({ items: [consentOf(purpose), consentOf(purpose, { revokedAt: '2026-01-02T12:00:00.000Z' })] }),
    );
    await page.goto(`/students/${both.id}`);
    await expect(purposeRegion(page, label), label).toContainText('Consentido, versão 1, em 04/10/2026');
    await expect(purposeRegion(page, label), label).not.toContainText('Revogado em');
  }
});

test('ficha_buttons_follow_the_state_of_each_purpose', async ({ page, api }) => {
  const cases: Array<[string, Consent[], 'Registrar consentimento' | 'Revogar']> = [
    ['pendente', [], 'Registrar consentimento'],
    ['só revogado', [consentOf('image_use', { revokedAt: NOW })], 'Registrar consentimento'],
    ['ativo', [consentOf('image_use')], 'Revogar'],
  ];
  for (const [name, items, shown] of cases) {
    const student = studentOf();
    serve(api, student, stateOf({ items }));

    await page.goto(`/students/${student.id}`);

    const region = purposeRegion(page, 'Uso da imagem');
    const hidden = shown === 'Revogar' ? 'Registrar consentimento' : 'Revogar';
    await expect(region.getByRole('button', { name: shown, exact: true }), name).toBeVisible();
    await expect(region.getByRole('button', { name: hidden, exact: true }), name).toHaveCount(0);
  }
});

test('grant_dialog_shows_term_and_confirms_before_sending', async ({ page, api }) => {
  const text = 'Linha um do termo.\nLinha dois com <b>negrito</b> dentro.\n\nÚltimo parágrafo.';
  const student = studentOf({ name: 'Aluna do Diálogo' });
  const state = stateOf({ guardian: guardianOf(), terms: termsOf(3, text) });
  serve(api, student, state);
  await page.goto(`/students/${student.id}`);

  await purposeRegion(page, 'Uso da imagem').getByRole('button', { name: 'Registrar consentimento', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Linha dois com <b>negrito</b> dentro.');
  expect(api.requests.filter((request) => request.path === '/api/consent-terms')).toHaveLength(1);
  expect(await dialog.innerText()).toContain('Linha um do termo.\nLinha dois com <b>negrito</b> dentro.\n\nÚltimo parágrafo.');
  await expect(dialog.locator('b')).toHaveCount(0);
  await expect(dialog.getByLabel('O próprio aluno', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('O responsável: Ana Souza', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmar', exact: true })).toBeVisible();
  expect(api.writes(), 'antes de confirmar').toHaveLength(0);

  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.writes(), 'depois de cancelar').toHaveLength(0);

  for (const [choice, grantedBy] of [
    ['O próprio aluno', 'student'],
    ['O responsável: Ana Souza', 'guardian'],
  ] as const) {
    state.items = [];
    api.requests = [];
    await page.goto(`/students/${student.id}`);
    await purposeRegion(page, 'Uso da imagem').getByRole('button', { name: 'Registrar consentimento', exact: true }).click();
    await page.getByRole('dialog').getByLabel(choice, { exact: true }).check();

    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();

    await expect.poll(() => api.writes().length, choice).toBe(1);
    expect(api.writes()[0]!.method).toBe('POST');
    expect(api.writes()[0]!.path).toBe(`/api/students/${student.id}/consents`);
    expect(api.writes()[0]!.body, choice).toEqual({ purpose: 'image_use', termVersion: 3, grantedBy });
  }
});

test('grant_dialog_for_minor_offers_only_the_guardian', async ({ page, api }) => {
  const covered = minorOf();
  const state = stateOf({ guardian: guardianOf() });
  serve(api, covered, state);
  await page.goto(`/students/${covered.id}`);

  await purposeRegion(page, 'Uso da imagem').getByRole('button', { name: 'Registrar consentimento', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('O responsável: Ana Souza', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('O próprio aluno', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect.poll(() => api.writes().length).toBe(1);
  expect((api.writes()[0]!.body as { grantedBy: string }).grantedBy).toBe('guardian');

  // sem responsável gravado: nada a confirmar
  const alone = minorOf();
  serve(api, alone, stateOf());
  api.requests = [];
  await page.goto(`/students/${alone.id}`);
  await purposeRegion(page, 'Uso da imagem').getByRole('button', { name: 'Registrar consentimento', exact: true }).click();

  const pending = page.getByRole('dialog');
  await expect(pending.getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
  await expect(
    pending.getByText('Responsável pendente: edite o aluno para cadastrar o responsável legal.', { exact: true }),
  ).toBeVisible();
  await pending.getByRole('button', { name: 'Confirmar', exact: true }).click({ force: true });
  expect(api.writes()).toHaveLength(0);
});

test('revoke_dialog_names_purpose_and_student_before_sending', async ({ page, api }) => {
  const student = studentOf({ name: 'Aluna Revogando' });
  const active = consentOf('image_use');
  serve(api, student, stateOf({ items: [active] }));
  await page.goto(`/students/${student.id}`);

  await purposeRegion(page, 'Uso da imagem').getByRole('button', { name: 'Revogar', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Uso da imagem');
  await expect(dialog).toContainText('Aluna Revogando');
  expect(api.writes(), 'antes de confirmar').toHaveLength(0);

  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.writes(), 'depois de cancelar').toHaveLength(0);

  await purposeRegion(page, 'Uso da imagem').getByRole('button', { name: 'Revogar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();

  await expect.poll(() => api.writes().length).toBe(1);
  expect(api.writes()[0]!.method).toBe('DELETE');
  expect(api.writes()[0]!.path).toBe(`/api/students/${student.id}/consents/${active.id}`);
});

test('block_shows_new_state_after_grant_and_revoke', async ({ page, api }) => {
  const student = studentOf();
  serve(api, student, stateOf());
  await page.goto(`/students/${student.id}`);
  const region = purposeRegion(page, 'Uso da imagem');

  await region.getByRole('button', { name: 'Registrar consentimento', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(region).toContainText('Consentido, versão 1, em 04/10/2026');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await region.getByRole('button', { name: 'Revogar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(region).toContainText('Revogado em 04/10/2026');
});

test('grant_409_messages_reload_the_term', async ({ page, api }) => {
  const student = studentOf();
  const state = stateOf({ terms: termsOf(1, 'Texto da versão 1.') });
  serve(api, student, state);
  const termCalls = () => api.requests.filter((request) => request.path === '/api/consent-terms').length;
  let posts = 0;
  api.on('POST', `/api/students/${student.id}/consents`, () => {
    posts += 1;
    return posts === 1 ? problem(409, 'consent_active') : problem(409, 'consent_term_outdated');
  });
  await page.goto(`/students/${student.id}`);
  await purposeRegion(page, 'Uso da imagem').getByRole('button', { name: 'Registrar consentimento', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Texto da versão 1.');
  expect(termCalls()).toBe(1);

  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();

  await expect(dialog.getByText('Este consentimento já foi registrado.', { exact: true })).toBeVisible();
  await expect.poll(termCalls).toBe(2);

  // o termo muda no servidor: a próxima tentativa recebe `consent_term_outdated`
  state.terms = termsOf(2, 'Texto da versão 2.');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();

  await expect(
    dialog.getByText('O termo foi atualizado. Leia a nova versão e confirme de novo.', { exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText('Texto da versão 2.');
  expect(api.writes().map((request) => (request.body as { termVersion: number }).termVersion)).toEqual([1, 1]);

  api.on('POST', `/api/students/${student.id}/consents`, { status: 201, body: consentOf('image_use', { termVersion: 2 }) });
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect.poll(() => api.writes().length).toBe(3);
  expect((api.writes()[2]!.body as { termVersion: number }).termVersion).toBe(2);
});

test('consents_load_failure_shows_retry_without_hiding_ficha', async ({ page, api }) => {
  const student = studentOf({ name: 'Aluna da Falha' });
  api.session = sessionOf('reception');
  api.on('GET', `/api/students/${student.id}`, { status: 200, body: student });
  api.on('GET', `/api/students/${student.id}/consents`, { status: 500 });
  // a ficha também pede as matrículas e as presenças: respondidas, o único bloco em erro é o de consentimentos
  api.on('GET', `/api/students/${student.id}/enrollments`, { status: 200, body: { items: [] } });
  api.on('GET', `/api/students/${student.id}/check-ins`, { status: 200, body: { items: [], nextCursor: null } });
  await page.goto(`/students/${student.id}`);

  await expect(page.getByText('Não foi possível carregar os consentimentos.', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Tentar novamente', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aluna da Falha' })).toBeVisible();
  await expect(page.getByText('529.982.247-25')).toHaveCount(0);
  await expect(page.getByText('123.456.789-09', { exact: true })).toBeVisible();

  serveConsents(api, student.id, stateOf());
  await retry.click();

  await expect(block(page)).toBeVisible();
  await expect(page.getByText('Não foi possível carregar os consentimentos.')).toHaveCount(0);
});

test('ficha_has_no_consent_block_or_calls_for_hr_finance_and_instructor', async ({ page, api }) => {
  for (const role of ['hr_finance', 'instructor'] as Role[]) {
    const student = studentOf();
    serve(api, student, stateOf({ guardian: guardianOf() }), role);
    api.requests = [];

    await page.goto(`/students/${student.id}`);

    await expect(page.getByRole('heading', { name: student.name }), role).toBeVisible();
    await expect(page.getByText('Responsável e consentimentos'), role).toHaveCount(0);
    expect(consentCalls(api), role).toEqual([]);
  }
});
