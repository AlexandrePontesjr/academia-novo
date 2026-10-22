import type { Role, Student, StudentListItem, StudentStatus } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, type FakeApi, problem, type Recorded, sessionOf, test } from './support/fake-api.ts';
import { formHydrated } from './support/motion.ts';

let counter = 0;
function studentOf(overrides: Partial<Student> = {}): Student {
  counter += 1;
  return {
    id: `018f0000-0000-7000-8000-0000000002${String(counter).padStart(2, '0')}`,
    name: `Aluno ${counter}`,
    status: 'active',
    cpf: '52998224725',
    birthDate: '2000-01-01',
    sex: 'female',
    email: 'aluno@exemplo.com',
    phone: '11912345678',
    address: 'Rua das Acácias, 120',
    emergencyContactName: 'Maria da Penha',
    emergencyContactPhone: '1134567890',
    healthNotes: 'Hipertensão controlada',
    ...overrides,
  };
}

const itemOf = (student: Student, withContact = true): StudentListItem => ({
  id: student.id,
  name: student.name,
  status: student.status,
  ...(withContact && { cpf: student.cpf, phone: student.phone }),
});

const listPage = (items: StudentListItem[], nextCursor: string | null = null) => ({
  status: 200,
  body: { items, nextCursor },
});

const listCalls = (api: FakeApi) =>
  api.requests.filter((request) => request.method === 'GET' && request.path === '/api/students');

const searchCalls = (api: FakeApi) => listCalls(api).filter((request) => request.query !== '');

const queryOf = (request: Recorded) => Object.fromEntries(new URLSearchParams(request.query));

const ROLES: Role[] = ['admin', 'reception', 'hr_finance', 'instructor'];

/** O que a API devolve na ficha de cada perfil (door 4). */
function fichaFor(role: Role, student: Student): Partial<Student> {
  if (role === 'instructor') return { id: student.id, name: student.name, status: student.status };
  if (role === 'hr_finance') return Object.fromEntries(Object.entries(student).filter(([key]) => key !== 'healthNotes'));
  return student;
}

function serveFicha(api: FakeApi, role: Role, student: Student) {
  api.session = sessionOf(role);
  api.on('GET', `/api/students/${student.id}`, { status: 200, body: fichaFor(role, student) });
}

test('anonymous_four_students_urls_redirect_to_login', async ({ page, api }) => {
  expect(api.session).toBeUndefined();
  const id = '018f0000-0000-7000-8000-0000000002ff';

  for (const path of ['/students', '/students/new', `/students/${id}`, `/students/${id}/edit`]) {
    await page.goto(path);

    await expect(page, path).toHaveURL('/login');
  }
});

test('list_title_four_columns_order_and_links', async ({ page, api }) => {
  // fora de ordem alfabética: quem ordena é a API, e a tela mantém a ordem que recebeu
  const students = [studentOf({ name: 'Zélia' }), studentOf({ name: 'Ana' }), studentOf({ name: 'Marcos' })];
  api.on('GET', '/api/students', listPage(students.map((student) => itemOf(student))));

  for (const role of ['admin', 'reception', 'hr_finance'] as Role[]) {
    api.session = sessionOf(role);
    await page.goto('/students');

    await expect(page.getByRole('heading', { name: 'Alunos', exact: true }), role).toBeVisible();
    expect(await page.getByRole('columnheader').allTextContents(), role).toEqual(['Nome', 'CPF', 'Telefone', 'Situação']);
    expect(await page.locator('tbody tr td:nth-child(1)').allTextContents(), role).toEqual(['Zélia', 'Ana', 'Marcos']);
    for (const student of students) {
      await expect(page.getByRole('link', { name: student.name, exact: true }), role).toHaveAttribute(
        'href',
        `/students/${student.id}`,
      );
    }
  }
});

test('list_instructor_two_columns', async ({ page, api }) => {
  api.session = sessionOf('instructor');
  const students = [studentOf(), studentOf({ status: 'suspended' })];
  api.on('GET', '/api/students', listPage(students.map((student) => itemOf(student, false))));

  await page.goto('/students');

  expect(await page.getByRole('columnheader').allTextContents()).toEqual(['Nome', 'Situação']);
  expect(await page.locator('tbody tr').count()).toBe(2);
});

test('formats_cpf_phone_birth_date_and_status', async ({ browser, api, baseURL }) => {
  const student = studentOf({ emergencyContactPhone: '1112345678' });
  const others = [
    studentOf({ phone: '1112345678', status: 'inactive' }),
    studentOf({ status: 'suspended' }),
  ];
  api.session = sessionOf('reception');
  api.on('GET', '/api/students', listPage([student, ...others].map((item) => itemOf(item))));
  api.on('GET', `/api/students/${student.id}`, { status: 200, body: student });

  for (const timezoneId of ['America/Sao_Paulo', 'UTC']) {
    const context = await browser.newContext({ baseURL, timezoneId });
    try {
      const page = await context.newPage();

      await page.goto('/students');
      expect(await page.locator('tbody tr:nth-child(1) td').allTextContents(), timezoneId).toEqual([
        student.name,
        '529.982.247-25',
        '(11) 91234-5678',
        'Ativo',
      ]);
      expect(await page.locator('tbody tr:nth-child(2) td').allTextContents(), timezoneId).toEqual([
        others[0]!.name,
        '529.982.247-25',
        '(11) 1234-5678',
        'Inativo',
      ]);
      await expect(page.locator('tbody tr:nth-child(3) td:nth-child(4)'), timezoneId).toHaveText('Suspenso');

      await page.goto(`/students/${student.id}`);
      await expect(page.getByText('01/01/2000', { exact: true }), timezoneId).toBeVisible();
      await expect(page.getByText('(11) 1234-5678', { exact: true }), timezoneId).toBeVisible();
    } finally {
      await context.close();
    }
  }
});

test('search_field_status_filter_and_two_buttons', async ({ page, api }) => {
  api.session = sessionOf('reception');
  api.on('GET', '/api/students', listPage([itemOf(studentOf())]));

  await page.goto('/students');

  await expect(page.getByRole('textbox', { name: 'Buscar por nome, CPF ou telefone', exact: true })).toBeVisible();
  const filter = page.getByLabel('Situação', { exact: true });
  expect(await filter.locator('option').allTextContents()).toEqual(['Todas', 'Ativo', 'Inativo', 'Suspenso']);
  await expect(page.getByRole('button', { name: 'Buscar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Limpar', exact: true })).toBeVisible();
  // acima da tabela
  const field = await page.getByLabel('Buscar por nome, CPF ou telefone').boundingBox();
  const table = await page.getByRole('table').boundingBox();
  expect(field!.y).toBeLessThan(table!.y);
});

test('search_sends_q_without_putting_it_in_the_url', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const initial = studentOf({ name: 'Primeira Lista' });
  const found = studentOf({ name: 'Achada pela Busca', status: 'inactive' });
  api.on('GET', '/api/students', (request) =>
    request.query === '' ? listPage([itemOf(initial)]) : listPage([itemOf(found)]),
  );
  await page.goto('/students');
  const before = page.url();

  await page.getByLabel('Buscar por nome, CPF ou telefone').fill('529.982.247-25');
  await page.getByLabel('Situação', { exact: true }).selectOption({ label: 'Inativo' });
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();

  await expect(page.getByRole('link', { name: 'Achada pela Busca' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Primeira Lista' })).toHaveCount(0);
  expect(searchCalls(api).map(queryOf)).toEqual([{ q: '529.982.247-25', status: 'inactive' }]);
  expect(page.url()).toBe(before);
  for (const text of ['529', '982', 'q=']) expect(page.url()).not.toContain(text);
});

test('next_page_keeps_search_and_status_and_sends_cursor', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const first = studentOf({ name: 'Da Primeira Página' });
  const second = studentOf({ name: 'Da Segunda Página' });
  api.on('GET', '/api/students', (request) => {
    const query = queryOf(request);
    if (!query.q) return listPage([]);
    return query.cursor ? listPage([itemOf(second)]) : listPage([itemOf(first)], 'CURSOR-DA-PAGINA-1');
  });
  await page.goto('/students');
  await page.getByLabel('Buscar por nome, CPF ou telefone').fill('silva');
  await page.getByLabel('Situação', { exact: true }).selectOption({ label: 'Suspenso' });
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Da Primeira Página' })).toBeVisible();

  await page.getByRole('button', { name: 'Próxima página', exact: true }).click();

  await expect(page.getByRole('link', { name: 'Da Segunda Página' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Da Primeira Página' })).toHaveCount(0);
  expect(searchCalls(api).map(queryOf)).toEqual([
    { q: 'silva', status: 'suspended' },
    { q: 'silva', status: 'suspended', cursor: 'CURSOR-DA-PAGINA-1' },
  ]);
  expect(page.url()).not.toContain('silva');
});

test('empty_search_shows_not_found_message', async ({ page, api }) => {
  api.session = sessionOf('reception');
  api.on('GET', '/api/students', (request) => (request.query === '' ? listPage([itemOf(studentOf())]) : listPage([])));
  await page.goto('/students');

  await page.getByLabel('Buscar por nome, CPF ou telefone').fill('ninguém');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();

  await expect(page.getByText('Nenhum aluno encontrado.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  await page.getByLabel('Buscar por nome, CPF ou telefone').fill('');
  await page.getByLabel('Situação', { exact: true }).selectOption({ label: 'Inativo' });
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();

  await expect(page.getByText('Nenhum aluno encontrado.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('empty_registry_shows_none_registered_message', async ({ page, api }) => {
  api.session = sessionOf('reception');
  api.on('GET', '/api/students', listPage([]));

  await page.goto('/students');

  await expect(page.getByText('Nenhum aluno cadastrado.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('load_failure_shows_retry_on_list_and_ficha', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const student = studentOf();
  let down = true;
  api.on('GET', '/api/students', () => (down ? { status: 500 } : listPage([itemOf(student)])));
  api.on('GET', `/api/students/${student.id}`, () => (down ? { status: 500 } : { status: 200, body: student }));

  await page.goto('/students');
  await expect(page.getByText('Não foi possível carregar os alunos.', { exact: true })).toBeVisible();
  down = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();

  down = true;
  await page.goto(`/students/${student.id}`);
  await expect(page.getByText('Não foi possível carregar os alunos.', { exact: true })).toBeVisible();
  down = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('heading', { name: student.name })).toBeVisible();
});

/** Os controles de escrita que a tela mostra, na ordem do documento. */
async function writeControls(page: Page) {
  const names = ['Novo aluno', 'Editar', 'Suspender', 'Inativar', 'Reativar'];
  const found: string[] = [];
  for (const name of names) {
    const count = await page.getByRole('link', { name, exact: true }).count();
    const buttons = await page.getByRole('button', { name, exact: true }).count();
    if (count + buttons > 0) found.push(name);
  }
  return found;
}

test('write_buttons_only_for_admin_and_reception', async ({ page, api }) => {
  const expected: Record<StudentStatus, string[]> = {
    active: ['Editar', 'Suspender', 'Inativar'],
    suspended: ['Editar', 'Inativar', 'Reativar'],
    inactive: ['Editar', 'Reativar'],
  };

  for (const role of ROLES) {
    const writer = role === 'admin' || role === 'reception';
    api.session = sessionOf(role);
    api.on('GET', '/api/students', listPage([]));
    await page.goto('/students');
    await expect(page.getByRole('heading', { name: 'Alunos', exact: true }), role).toBeVisible();
    expect(await writeControls(page), `${role} lista`).toEqual(writer ? ['Novo aluno'] : []);

    for (const status of ['active', 'suspended', 'inactive'] as StudentStatus[]) {
      const student = studentOf({ status });
      serveFicha(api, role, student);
      await page.goto(`/students/${student.id}`);
      await expect(page.getByRole('heading', { name: student.name }), `${role} ${status}`).toBeVisible();

      expect(await writeControls(page), `${role} ${status}`).toEqual(writer ? expected[status] : []);
    }
  }
});

test('form_pages_show_no_permission_for_two_roles', async ({ page, api }) => {
  const student = studentOf();
  let cases = 0;
  for (const role of ['hr_finance', 'instructor'] as Role[]) {
    serveFicha(api, role, student);
    for (const path of ['/students/new', `/students/${student.id}/edit`]) {
      await page.goto(path);

      await expect(page.getByText('Você não tem permissão para acessar esta página.', { exact: true }), `${role} ${path}`).toBeVisible();
      await expect(page.getByRole('textbox'), `${role} ${path}`).toHaveCount(0);
      await expect(page.getByRole('combobox'), `${role} ${path}`).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Salvar' }), `${role} ${path}`).toHaveCount(0);
      cases += 1;
    }
  }
  expect(cases).toBe(4);
});

test('form_labels_options_and_save_button_on_new_and_edit', async ({ page, api }) => {
  const student = studentOf();
  serveFicha(api, 'reception', student);

  for (const path of ['/students/new', `/students/${student.id}/edit`]) {
    await page.goto(path);

    for (const label of [
      'Nome completo',
      'CPF',
      'Data de nascimento',
      'Sexo',
      'E-mail',
      'Telefone',
      'Endereço',
      'Contato de emergência (nome)',
      'Contato de emergência (telefone)',
      'Observações de saúde',
    ]) {
      await expect(page.getByLabel(label, { exact: true }), `${path} ${label}`).toBeVisible();
    }
    expect(await page.getByLabel('Sexo', { exact: true }).locator('option').allTextContents(), path).toEqual([
      '',
      'Feminino',
      'Masculino',
      'Outro',
    ]);
    await expect(page.getByRole('button', { name: 'Salvar', exact: true }), path).toBeVisible();
  }
  // a edição abre com o que está gravado, já com máscara
  await expect(page.getByLabel('CPF', { exact: true })).toHaveValue('529.982.247-25');
  await expect(page.getByLabel('Telefone', { exact: true })).toHaveValue('(11) 91234-5678');
});

test('save_new_student_goes_to_its_ficha', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const created = studentOf({ name: 'Aluna Recém Cadastrada' });
  api.on('POST', '/api/students', { status: 201, body: created });
  api.on('GET', `/api/students/${created.id}`, { status: 200, body: created });
  await page.goto('/students/new');

  await page.getByLabel('Nome completo', { exact: true }).fill('Aluna Recém Cadastrada');
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByLabel('Data de nascimento', { exact: true }).fill('2000-01-01');
  await page.getByLabel('Telefone', { exact: true }).fill('(11) 91234-5678');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(page).toHaveURL(`/students/${created.id}`);
  await expect(page.getByRole('heading', { name: 'Aluna Recém Cadastrada' })).toBeVisible();
  expect(api.writes().map((request) => ({ method: request.method, path: request.path, body: request.body }))).toEqual([
    {
      method: 'POST',
      path: '/api/students',
      body: {
        name: 'Aluna Recém Cadastrada',
        cpf: '529.982.247-25',
        birthDate: '2000-01-01',
        phone: '(11) 91234-5678',
      },
    },
  ]);
});

test('cpf_taken_shown_on_cpf_field_keeps_other_fields', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const student = studentOf();
  api.on('POST', '/api/students', problem(409, 'cpf_taken'));
  api.on('PATCH', `/api/students/${student.id}`, problem(409, 'cpf_taken'));
  api.on('GET', `/api/students/${student.id}`, { status: 200, body: student });

  await page.goto('/students/new');
  await page.getByLabel('Nome completo', { exact: true }).fill('Nome Digitado');
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByLabel('Data de nascimento', { exact: true }).fill('1999-12-31');
  await page.getByLabel('Telefone', { exact: true }).fill('(11) 91234-5678');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(page.getByLabel('CPF', { exact: true })).toHaveAccessibleDescription('Já existe um aluno com este CPF.');
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue('Nome Digitado');
  await expect(page.getByLabel('Data de nascimento', { exact: true })).toHaveValue('1999-12-31');
  await expect(page.getByLabel('Telefone', { exact: true })).toHaveValue('(11) 91234-5678');

  await page.goto(`/students/${student.id}/edit`);
  await page.getByLabel('Nome completo', { exact: true }).fill('Outro Nome Digitado');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(page.getByLabel('CPF', { exact: true })).toHaveAccessibleDescription('Já existe um aluno com este CPF.');
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue('Outro Nome Digitado');
  await expect(page.getByLabel('Telefone', { exact: true })).toHaveValue('(11) 91234-5678');
});

test('ficha_shows_returned_fields_dash_for_null_no_label_for_absent', async ({ page, api }) => {
  const student = studentOf({ sex: null, email: null, address: null, emergencyContactName: null, emergencyContactPhone: null, healthNotes: null });
  const labelsOf = () => page.locator('dt').allTextContents();

  serveFicha(api, 'reception', student);
  await page.goto(`/students/${student.id}`);
  await expect(page.getByRole('heading', { name: student.name })).toBeVisible();
  expect(await labelsOf()).toEqual([
    'Situação',
    'CPF',
    'Data de nascimento',
    'Sexo',
    'E-mail',
    'Telefone',
    'Endereço',
    'Contato de emergência (nome)',
    'Contato de emergência (telefone)',
    'Observações de saúde',
  ]);
  expect(await page.locator('dd').allTextContents()).toEqual([
    'Ativo',
    '529.982.247-25',
    '01/01/2000',
    '—',
    '—',
    '(11) 91234-5678',
    '—',
    '—',
    '—',
    '—',
  ]);

  serveFicha(api, 'hr_finance', student);
  await page.goto(`/students/${student.id}`);
  await expect(page.getByRole('heading', { name: student.name })).toBeVisible();
  expect(await labelsOf()).not.toContain('Observações de saúde');
  expect(await labelsOf()).toContain('Endereço');

  serveFicha(api, 'instructor', student);
  await page.goto(`/students/${student.id}`);
  await expect(page.getByRole('heading', { name: student.name })).toBeVisible();
  expect(await labelsOf()).toEqual(['Situação']);
});

test('situation_buttons_per_status', async ({ page, api }) => {
  const expected: Record<StudentStatus, { shown: string[]; hidden: string[] }> = {
    active: { shown: ['Suspender', 'Inativar'], hidden: ['Reativar'] },
    suspended: { shown: ['Reativar', 'Inativar'], hidden: ['Suspender'] },
    inactive: { shown: ['Reativar'], hidden: ['Suspender', 'Inativar'] },
  };

  for (const status of ['active', 'suspended', 'inactive'] as StudentStatus[]) {
    const student = studentOf({ status });
    serveFicha(api, 'reception', student);
    await page.goto(`/students/${student.id}`);
    await expect(page.getByRole('heading', { name: student.name })).toBeVisible();

    for (const name of expected[status].shown) {
      await expect(page.getByRole('button', { name, exact: true }), `${status} ${name}`).toHaveCount(1);
    }
    for (const name of expected[status].hidden) {
      await expect(page.getByRole('button', { name, exact: true }), `${status} ${name}`).toHaveCount(0);
    }
  }
});

test('inactivate_and_suspend_confirm_naming_the_student', async ({ page, api }) => {
  const student = studentOf({ name: 'Joana Confirmada' });
  serveFicha(api, 'reception', student);
  api.on('PATCH', `/api/students/${student.id}`, { status: 200, body: { ...student, status: 'suspended' } });
  api.on('DELETE', `/api/students/${student.id}`, { status: 204 });
  await page.goto(`/students/${student.id}`);

  for (const [button, confirm, method] of [
    ['Suspender', 'Suspender', 'PATCH'],
    ['Inativar', 'Inativar', 'DELETE'],
  ] as const) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog, button).toContainText('Joana Confirmada');
    expect(api.writes(), `${button} antes de confirmar`).toHaveLength(button === 'Suspender' ? 0 : 1);

    // cancelar não envia nada
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog, button).toHaveCount(0);
    expect(api.writes(), `${button} depois de cancelar`).toHaveLength(button === 'Suspender' ? 0 : 1);

    await page.getByRole('button', { name: button, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: confirm, exact: true }).click();
    await expect.poll(() => api.writes().at(-1)?.method, button).toBe(method);
  }
  expect(api.writes().map((request) => `${request.method} ${request.path}`)).toEqual([
    `PATCH /api/students/${student.id}`,
    `DELETE /api/students/${student.id}`,
  ]);
});

test('ficha_shows_new_status_after_each_change', async ({ page, api }) => {
  api.session = sessionOf('reception');
  let current = studentOf({ name: 'Mudança de Situação', status: 'active' });
  api.on('GET', `/api/students/${current.id}`, () => ({ status: 200, body: current }));
  api.on('PATCH', `/api/students/${current.id}`, (request) => {
    current = { ...current, ...(request.body as Partial<Student>) };
    return { status: 200, body: current };
  });
  api.on('DELETE', `/api/students/${current.id}`, () => {
    current = { ...current, status: 'inactive' };
    return { status: 204 };
  });
  const status = () => page.locator('dd').first();
  await page.goto(`/students/${current.id}`);

  await page.getByRole('button', { name: 'Suspender', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Suspender', exact: true }).click();
  await expect(status()).toHaveText('Suspenso');

  await page.getByRole('button', { name: 'Reativar', exact: true }).click();
  await expect(status()).toHaveText('Ativo');

  await page.getByRole('button', { name: 'Inativar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Inativar', exact: true }).click();
  await expect(status()).toHaveText('Inativo');

  expect(api.writes().map((request) => ({ method: request.method, body: request.body }))).toEqual([
    { method: 'PATCH', body: { status: 'suspended' } },
    { method: 'PATCH', body: { status: 'active' } },
    { method: 'DELETE', body: undefined },
  ]);
});

test('unknown_student_shows_not_found_message', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const id = '018f0000-0000-7000-8000-0000000002fe';
  api.on('GET', `/api/students/${id}`, problem(404, 'not_found'));

  for (const path of [`/students/${id}`, `/students/${id}/edit`]) {
    await page.goto(path);

    await expect(page.getByText('Aluno não encontrado.', { exact: true }), path).toBeVisible();
  }
});

test('save_button_disabled_while_waiting_on_both_forms', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const student = studentOf();
  api.on('POST', '/api/students', 'hang');
  api.on('PATCH', `/api/students/${student.id}`, 'hang');
  api.on('GET', `/api/students/${student.id}`, { status: 200, body: student });

  await page.goto('/students/new');
  await page.getByLabel('Nome completo', { exact: true }).fill('Aluna Esperando');
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByLabel('Data de nascimento', { exact: true }).fill('2000-01-01');
  await page.getByLabel('Telefone', { exact: true }).fill('11912345678');
  const save = page.getByRole('button', { name: 'Salvar', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled();
  await expect.poll(() => api.writes().length).toBe(1);

  await page.goto(`/students/${student.id}/edit`);
  const saveEdit = page.getByRole('button', { name: 'Salvar', exact: true });
  await expect(saveEdit).toBeEnabled();
  await saveEdit.click();
  await expect(saveEdit).toBeDisabled();
  await expect.poll(() => api.writes().length).toBe(2);
});

test('edit_form_sends_patch_with_typed_values_and_null_for_cleared', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const student = studentOf();
  const saved = { ...student, name: 'Nome Corrigido', email: null, address: null };
  api.on('GET', `/api/students/${student.id}`, { status: 200, body: student });
  api.on('PATCH', `/api/students/${student.id}`, { status: 200, body: saved });
  await page.goto(`/students/${student.id}/edit`);

  await page.getByLabel('Nome completo', { exact: true }).fill('  Nome Corrigido  ');
  await page.getByLabel('E-mail', { exact: true }).fill('');
  await page.getByLabel('Endereço', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(page).toHaveURL(`/students/${student.id}`);
  expect(api.writes().map((request) => ({ method: request.method, path: request.path, body: request.body }))).toEqual([
    {
      method: 'PATCH',
      path: `/api/students/${student.id}`,
      body: {
        name: 'Nome Corrigido',
        cpf: '529.982.247-25',
        birthDate: '2000-01-01',
        phone: '(11) 91234-5678',
        sex: 'female',
        email: null,
        address: null,
        emergencyContactName: 'Maria da Penha',
        emergencyContactPhone: '(11) 3456-7890',
        healthNotes: 'Hipertensão controlada',
      },
    },
  ]);
});

const GUARDIAN = {
  id: '018f0000-0000-7000-8000-0000000003aa',
  name: 'Ana Souza',
  cpf: '52998224725',
  phone: '11912345678',
  relationship: 'mother' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const TEN_YEARS_AGO = `${new Date().getFullYear() - 10}-01-01`;
const GUARDIAN_LABELS = ['Nome do responsável', 'CPF do responsável', 'Telefone do responsável', 'Parentesco'];
const guardianGroup = (page: Page) => page.getByRole('group', { name: 'Responsável legal', exact: true });

/** A edição do aluno com o responsável atual que a ficha de consentimentos devolve (ou nenhum). */
function serveEdit(api: FakeApi, student: Student, guardian: typeof GUARDIAN | null = null) {
  api.session = sessionOf('reception');
  api.on('GET', `/api/students/${student.id}`, { status: 200, body: student });
  api.on('GET', `/api/students/${student.id}/consents`, { status: 200, body: { guardian, items: [] } });
}

test('guardian_block_shown_only_for_minor_on_both_forms', async ({ browser, api, baseURL }) => {
  const student = studentOf();
  serveEdit(api, student);
  // 02:30 UTC de 5/10 são 23:30 de 4/10 em São Paulo; o navegador está em UTC
  const context = await browser.newContext({ baseURL, timezoneId: 'UTC' });
  try {
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-04T23:30:00-03:00'));

    for (const path of ['/students/new', `/students/${student.id}/edit`]) {
      await page.goto(path);
      await formHydrated(page);
      const birthDate = page.getByLabel('Data de nascimento', { exact: true });

      await birthDate.fill('2008-10-05');
      await expect(guardianGroup(page), `${path} faz 18 anos amanhã`).toBeVisible();
      for (const label of GUARDIAN_LABELS) {
        await expect(guardianGroup(page).getByLabel(label, { exact: true }), `${path} ${label}`).toBeVisible();
      }
      expect(
        await guardianGroup(page).getByLabel('Parentesco', { exact: true }).locator('option').allTextContents(),
        path,
      ).toEqual(['', 'Mãe', 'Pai', 'Responsável legal', 'Outro']);

      await birthDate.fill('2008-10-04');
      await expect(guardianGroup(page), `${path} faz 18 anos hoje`).toHaveCount(0);
      await birthDate.fill('1990-11-30');
      await expect(guardianGroup(page), `${path} adulto`).toHaveCount(0);
      await birthDate.fill('2008-10-05');
      await expect(guardianGroup(page), `${path} de novo menor`).toBeVisible();
      await birthDate.fill('2000-01-01');
      await expect(guardianGroup(page), `${path} de volta a adulto`).toHaveCount(0);

      // com o bloco exibido e os quatro campos vazios, salvar não envia nada
      await birthDate.fill('2008-10-05');
      if (path === '/students/new') {
        await page.getByLabel('Nome completo', { exact: true }).fill('Menor Digitado');
        await page.getByLabel('CPF', { exact: true }).fill('123.456.789-09');
        await page.getByLabel('Telefone', { exact: true }).fill('(11) 91234-5678');
      }
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(guardianGroup(page).getByLabel('Nome do responsável', { exact: true })).toHaveAccessibleDescription(/.+/);
      expect(api.writes(), path).toHaveLength(0);
    }
  } finally {
    await context.close();
  }
});

test('form_sends_guardian_in_the_same_write_and_prefills_on_edit', async ({ page, api }) => {
  api.session = sessionOf('reception');
  const created = studentOf({ birthDate: TEN_YEARS_AGO });
  api.on('POST', '/api/students', { status: 201, body: created });
  api.on('GET', `/api/students/${created.id}`, { status: 200, body: created });
  api.on('GET', `/api/students/${created.id}/consents`, { status: 200, body: { guardian: null, items: [] } });

  const options: Array<[string, string]> = [
    ['Mãe', 'mother'],
    ['Pai', 'father'],
    ['Responsável legal', 'legal_guardian'],
    ['Outro', 'other'],
  ];
  for (const [label, value] of options) {
    api.requests = [];
    await page.goto('/students/new');
    await page.getByLabel('Nome completo', { exact: true }).fill('Menor Novo');
    await page.getByLabel('CPF', { exact: true }).fill('123.456.789-09');
    await page.getByLabel('Data de nascimento', { exact: true }).fill(TEN_YEARS_AGO);
    await page.getByLabel('Telefone', { exact: true }).fill('(11) 98765-4321');
    await page.getByLabel('Nome do responsável', { exact: true }).fill('Ana Souza');
    await page.getByLabel('CPF do responsável', { exact: true }).fill('529.982.247-25');
    await page.getByLabel('Telefone do responsável', { exact: true }).fill('(11) 91234-5678');
    await page.getByLabel('Parentesco', { exact: true }).selectOption({ label });

    await page.getByRole('button', { name: 'Salvar', exact: true }).click();

    await expect.poll(() => api.writes().length, label).toBe(1);
    expect(api.writes()[0]!.method, label).toBe('POST');
    expect((api.writes()[0]!.body as { guardian: unknown }).guardian, label).toEqual({
      name: 'Ana Souza',
      cpf: '529.982.247-25',
      phone: '(11) 91234-5678',
      relationship: value,
    });
  }

  // a edição do menor que já tem responsável abre com ele e o devolve inteiro
  const minor = studentOf({ birthDate: TEN_YEARS_AGO });
  serveEdit(api, minor, GUARDIAN);
  api.on('PATCH', `/api/students/${minor.id}`, { status: 200, body: minor });
  api.requests = [];
  await page.goto(`/students/${minor.id}/edit`);

  await expect(page.getByLabel('Nome do responsável', { exact: true })).toHaveValue('Ana Souza');
  await expect(page.getByLabel('CPF do responsável', { exact: true })).toHaveValue('529.982.247-25');
  await expect(page.getByLabel('Telefone do responsável', { exact: true })).toHaveValue('(11) 91234-5678');
  await expect(page.getByLabel('Parentesco', { exact: true })).toHaveValue('mother');
  expect(
    api.requests.some((request) => request.method === 'GET' && request.path === `/api/students/${minor.id}/consents`),
  ).toBe(true);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => api.writes().length).toBe(1);
  const sent = (api.writes()[0]!.body as { guardian: Record<string, string> }).guardian;
  expect(sent.name).toBe('Ana Souza');
  expect(sent.relationship).toBe('mother');
  expect(sent.cpf!.replace(/\D/g, '')).toBe('52998224725');
  expect(sent.phone!.replace(/\D/g, '')).toBe('11912345678');

  // o adulto não leva a chave, com ou sem responsável gravado
  const adult = studentOf();
  for (const guardian of [null, GUARDIAN]) {
    const label = `PATCH ${guardian ? 'com' : 'sem'} responsável`;
    serveEdit(api, adult, guardian);
    api.on('PATCH', `/api/students/${adult.id}`, { status: 200, body: adult });
    api.requests = [];
    await page.goto(`/students/${adult.id}/edit`);
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect.poll(() => api.writes().length, label).toBe(1);
    expect(Object.keys(api.writes()[0]!.body as object), label).not.toContain('guardian');
  }
  api.requests = [];
  await page.goto('/students/new');
  await page.getByLabel('Nome completo', { exact: true }).fill('Adulta Nova');
  await page.getByLabel('CPF', { exact: true }).fill('123.456.789-09');
  await page.getByLabel('Data de nascimento', { exact: true }).fill('1990-11-30');
  await page.getByLabel('Telefone', { exact: true }).fill('(11) 98765-4321');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => api.writes().length).toBe(1);
  expect(Object.keys(api.writes()[0]!.body as object)).not.toContain('guardian');
});

test('guardian_422_shown_on_each_field_keeps_the_rest', async ({ page, api }) => {
  const minor = studentOf({ birthDate: TEN_YEARS_AGO });
  serveEdit(api, minor, GUARDIAN);
  const cases: Array<[path: string, label: string | undefined]> = [
    ['guardian.name', 'Nome do responsável'],
    ['guardian.cpf', 'CPF do responsável'],
    ['guardian.phone', 'Telefone do responsável'],
    ['guardian.relationship', 'Parentesco'],
    ['guardian', undefined],
  ];
  expect(cases).toHaveLength(5);

  for (const target of ['new', 'edit']) {
    for (const [path, label] of cases) {
      const message = `Mensagem da API para ${path}`;
      api.on('POST', '/api/students', problem(422, 'validation_failed', [{ path, message }]));
      api.on('PATCH', `/api/students/${minor.id}`, problem(422, 'validation_failed', [{ path, message }]));
      await page.goto(target === 'new' ? '/students/new' : `/students/${minor.id}/edit`);
      await formHydrated(page);
      if (target === 'new') {
        await page.getByLabel('Nome completo', { exact: true }).fill('Menor Digitado');
        await page.getByLabel('CPF', { exact: true }).fill('123.456.789-09');
        await page.getByLabel('Data de nascimento', { exact: true }).fill(TEN_YEARS_AGO);
        await page.getByLabel('Telefone', { exact: true }).fill('(11) 98765-4321');
        await page.getByLabel('Nome do responsável', { exact: true }).fill('Ana Souza');
        await page.getByLabel('CPF do responsável', { exact: true }).fill('529.982.247-25');
        await page.getByLabel('Telefone do responsável', { exact: true }).fill('(11) 91234-5678');
        await page.getByLabel('Parentesco', { exact: true }).selectOption({ label: 'Mãe' });
      } else {
        await page.getByLabel('Nome completo', { exact: true }).fill('Menor Digitado');
      }

      await page.getByRole('button', { name: 'Salvar', exact: true }).click();

      if (label) {
        await expect(page.getByLabel(label, { exact: true }), `${target} ${path}`).toHaveAccessibleDescription(message);
      } else {
        await expect(guardianGroup(page).getByText(message, { exact: true }), `${target} ${path}`).toBeVisible();
      }
      await expect(page.getByLabel('Nome completo', { exact: true }), `${target} ${path}`).toHaveValue('Menor Digitado');
      if (target === 'new') {
        await expect(page.getByLabel('Telefone', { exact: true }), `${target} ${path}`).toHaveValue('(11) 98765-4321');
        await expect(page.getByLabel('Nome do responsável', { exact: true }), `${target} ${path}`).toHaveValue('Ana Souza');
      }
    }
  }
});
