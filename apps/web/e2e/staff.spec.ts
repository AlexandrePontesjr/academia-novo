import type { Page } from '@playwright/test';
import { FAKE_API_PORT } from '../playwright.config.ts';
import { expect, problem, servePhotoFile, test, userOf } from './support/fake-api.ts';
import { formHydrated } from './support/motion.ts';
import { PHOTO_URL } from './support/photo.ts';
import {
  DENIED_ROLES,
  itemOf,
  linkedOf,
  NO_PERMISSION,
  STAFF_ID,
  STAFF_ROLES,
  type StaffState,
  serveStaff,
  serveStaffAs,
  staffOf,
  staffRequests,
  staffWrites,
} from './support/staff.ts';

const ROUTE = `/api/staff/${STAFF_ID}`;
const FOUR_URLS = ['/staff', '/staff/new', `/staff/${STAFF_ID}`, `/staff/${STAFF_ID}/edit`];
const THUMB_PATH = '/api/photo-files/018f0000-0000-7000-8000-000000000999/thumb';
const THUMB_URL = `${THUMB_PATH}?exp=2000000000&sig=assinatura`;

/** O valor que a ficha mostra sob o rótulo dado. */
const field = (page: Page, label: string) =>
  page
    .locator('dt')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd');

const access = (page: Page) => page.getByRole('region', { name: 'Acesso ao sistema' });
const save = (page: Page) => page.getByRole('button', { name: 'Salvar', exact: true });
const state = (overrides: Partial<StaffState> = {}): StaffState => ({ staff: [staffOf()], users: [], ...overrides });

/** Quantas vezes o controle aparece, como link ou como botão. */
async function controls(page: Page, name: string) {
  return (
    (await page.getByRole('link', { name, exact: true }).count()) +
    (await page.getByRole('button', { name, exact: true }).count())
  );
}

test('anonymous_four_staff_urls_redirect_to_login', async ({ page, api }) => {
  expect(api.session).toBeUndefined();
  serveStaff(api, state());

  for (const path of FOUR_URLS) {
    await page.goto(path);

    await expect(page, path).toHaveURL('/login');
  }
  expect(staffRequests(api)).toHaveLength(0);
});

test('reception_and_instructor_see_no_permission_on_four_staff_urls', async ({ page, api }) => {
  const member = staffOf();
  const secrets = [member.name, member.cpf, '529.982.247-25', member.position, member.phone, '(11) 91234-5678'];
  const everyRoute: Array<[method: string, path: string]> = [
    ['GET', '/api/staff'],
    ['POST', '/api/staff'],
    ['GET', ROUTE],
    ['PATCH', ROUTE],
    ['DELETE', ROUTE],
    ['PUT', `${ROUTE}/user`],
    ['DELETE', `${ROUTE}/user`],
    ['POST', `${ROUTE}/photo`],
    ['PUT', `${ROUTE}/photo`],
    ['DELETE', `${ROUTE}/photo`],
  ];

  for (const role of DENIED_ROLES) {
    serveStaffAs(api, role, state({ staff: [member] }));
    for (const path of FOUR_URLS) {
      await page.goto(path);

      await expect(page.getByText(NO_PERMISSION, { exact: true }), `${role} ${path}`).toBeVisible();
      const text = await page.locator('body').innerText();
      for (const secret of secrets) expect(text, `${role} ${path}: ${secret}`).not.toContain(secret);
    }

    // a API falsa recusa como a real: 403 com `forbidden` a toda requisição de `/api/staff*`
    for (const [method, path] of everyRoute) {
      const response = await fetch(`http://127.0.0.1:${FAKE_API_PORT}${path}`, { method });
      expect(response.status, `${role} ${method} ${path}`).toBe(403);
      expect(((await response.json()) as { code: string }).code, `${role} ${method} ${path}`).toBe('forbidden');
    }
  }
});

test('list_title_button_four_columns_order_thumbnail_and_links', async ({ page, api }) => {
  servePhotoFile(api, THUMB_PATH);
  // fora de ordem alfabética: quem ordena é a API, e a tela mantém a ordem que recebeu
  const members = [
    staffOf({ id: '018f0000-0000-7000-8000-000000000411', name: 'Zélia Nunes', photoUrl: PHOTO_URL }),
    staffOf({ id: '018f0000-0000-7000-8000-000000000412', name: 'Ana Souza', department: null }),
    staffOf({ id: '018f0000-0000-7000-8000-000000000413', name: 'Marcos Lima', status: 'inactive' }),
  ];

  for (const role of STAFF_ROLES) {
    serveStaffAs(api, role, state({ staff: members }));
    await page.goto('/staff');

    await expect(page.getByRole('heading', { name: 'Funcionários', exact: true }), role).toBeVisible();
    await expect(page.getByRole('link', { name: 'Novo funcionário', exact: true }), role).toHaveAttribute(
      'href',
      '/staff/new',
    );
    expect(await page.getByRole('columnheader').allTextContents(), role).toEqual(['Nome', 'Cargo', 'Setor', 'Situação']);
    expect(await page.locator('tbody tr td:nth-child(1)').allTextContents(), role).toEqual([
      'Zélia Nunes',
      'Ana Souza',
      'Marcos Lima',
    ]);
    expect(await page.locator('tbody tr td:nth-child(2)').allTextContents(), role).toEqual(Array(3).fill('Fisioterapeuta Esportiva'));
    expect(await page.locator('tbody tr td:nth-child(3)').allTextContents(), role).toEqual(['Reabilitação', '—', 'Reabilitação']);
    expect(await page.locator('tbody tr td:nth-child(4)').allTextContents(), role).toEqual(['Ativo', 'Ativo', 'Inativo']);

    const cells = page.locator('tbody tr td:nth-child(1)');
    // a miniatura (variante `thumb`) ou o círculo das iniciais vem antes do nome
    await expect(cells.nth(0).locator('img'), role).toHaveAttribute('src', THUMB_URL);
    await expect(cells.nth(1).getByRole('img', { name: 'Sem foto' }), role).toBeVisible();
    for (const [index, member] of members.entries()) {
      const cell = cells.nth(index);
      const avatarBeforeName = await cell.evaluate((element) => {
        const avatar = element.querySelector('img, [aria-label="Sem foto"]');
        const link = element.querySelector('a');
        return Boolean(avatar && link && avatar.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(avatarBeforeName, `${role} ${member.name}`).toBe(true);
      await expect(cell.getByRole('link', { name: member.name, exact: true }), role).toHaveAttribute(
        'href',
        `/staff/${member.id}`,
      );
    }
  }
});

test('empty_registry_shows_no_staff_message', async ({ page, api }) => {
  for (const role of STAFF_ROLES) {
    serveStaffAs(api, role, state({ staff: [] }));

    await page.goto('/staff');

    await expect(page.getByText('Nenhum funcionário cadastrado.', { exact: true }), role).toBeVisible();
    await expect(page.getByRole('table'), role).toHaveCount(0);
  }
});

test('list_render_asks_for_the_list_once_and_never_for_a_ficha', async ({ page, api }) => {
  const members = [
    staffOf({ id: '018f0000-0000-7000-8000-000000000411', name: 'Ana Souza' }),
    staffOf({ id: '018f0000-0000-7000-8000-000000000412', name: 'Bruno Lima' }),
    staffOf({ id: '018f0000-0000-7000-8000-000000000413', name: 'Carla Dias' }),
  ];
  serveStaffAs(api, 'hr_finance', state({ staff: members }));

  await page.goto('/staff');
  await expect(page.getByRole('table')).toBeVisible();
  // os links das fichas à vista na janela e o ponteiro sobre cada um
  for (const member of members) {
    const link = page.getByRole('link', { name: member.name, exact: true });
    await link.scrollIntoViewIfNeeded();
    await link.hover();
  }
  await page.waitForTimeout(3000);

  const lists = api.requests.filter((request) => request.method === 'GET' && request.path === '/api/staff');
  expect(lists).toHaveLength(1);
  const fichas = api.requests.filter((request) => /^\/api\/staff\/[^/]+/.test(request.path));
  expect(fichas).toHaveLength(0);
});

test('load_failure_shows_retry_on_list_and_ficha', async ({ page, api }) => {
  const member = staffOf();
  serveStaffAs(api, 'hr_finance', state({ staff: [member] }));
  let down = true;
  api.on('GET', '/api/staff', () => (down ? { status: 500 } : { status: 200, body: { items: [itemOf(member)] } }));
  api.on('GET', ROUTE, () => (down ? { status: 500 } : { status: 200, body: member }));

  await page.goto('/staff');
  await expect(page.getByText('Não foi possível carregar os funcionários.', { exact: true })).toBeVisible();
  down = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();

  down = true;
  await page.goto(`/staff/${STAFF_ID}`);
  await expect(page.getByText('Não foi possível carregar os funcionários.', { exact: true })).toBeVisible();
  down = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('heading', { name: member.name })).toBeVisible();
});

test('form_labels_and_save_button_on_new_and_edit', async ({ page, api }) => {
  const member = staffOf();
  serveStaffAs(api, 'hr_finance', state({ staff: [member] }));

  for (const path of ['/staff/new', `/staff/${STAFF_ID}/edit`]) {
    await page.goto(path);

    for (const label of ['Nome completo', 'CPF', 'Cargo', 'Setor', 'Data de admissão', 'Telefone', 'E-mail']) {
      await expect(page.getByLabel(label, { exact: true }), `${path} ${label}`).toBeVisible();
    }
    await expect(save(page), path).toBeVisible();
  }
  // a edição abre com os valores da ficha, o CPF e o telefone já com máscara
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue('Rafaela Prado Cunha');
  await expect(page.getByLabel('CPF', { exact: true })).toHaveValue('529.982.247-25');
  await expect(page.getByLabel('Cargo', { exact: true })).toHaveValue('Fisioterapeuta Esportiva');
  await expect(page.getByLabel('Setor', { exact: true })).toHaveValue('Reabilitação');
  await expect(page.getByLabel('Data de admissão', { exact: true })).toHaveValue('2021-03-15');
  await expect(page.getByLabel('Telefone', { exact: true })).toHaveValue('(11) 91234-5678');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('rafaela.prado@exemplo.com');
});

test('save_navigates_to_the_ficha_of_the_created_and_the_edited_staff', async ({ page, api }) => {
  const created = staffOf({ id: '018f0000-0000-7000-8000-000000000499', name: 'Funcionária Recém Cadastrada' });
  const edited = staffOf({ position: 'Coordenadora' });

  for (const role of STAFF_ROLES) {
    serveStaffAs(api, role, state({ staff: [created, edited] }));
    api.on('POST', '/api/staff', { status: 201, body: created });
    api.on('PATCH', ROUTE, { status: 200, body: edited });

    await page.goto('/staff/new');
    await page.getByLabel('Nome completo', { exact: true }).fill('Funcionária Recém Cadastrada');
    await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
    await page.getByLabel('Cargo', { exact: true }).fill('Fisioterapeuta Esportiva');
    await page.getByLabel('Data de admissão', { exact: true }).fill('2021-03-15');
    await page.getByLabel('Telefone', { exact: true }).fill('(11) 91234-5678');
    await save(page).click();

    await expect(page, `${role}: cadastro`).toHaveURL(`/staff/${created.id}`);
    await expect(page.getByRole('heading', { name: created.name }), role).toBeVisible();

    await page.goto(`/staff/${STAFF_ID}/edit`);
    await page.getByLabel('Cargo', { exact: true }).fill('Coordenadora');
    await save(page).click();

    await expect(page, `${role}: edição`).toHaveURL(`/staff/${STAFF_ID}`);
  }
});

test('cpf_taken_shown_on_cpf_field_keeps_other_fields_on_both_forms', async ({ page, api }) => {
  serveStaffAs(api, 'hr_finance', state());
  api.on('POST', '/api/staff', problem(409, 'cpf_taken'));
  api.on('PATCH', ROUTE, problem(409, 'cpf_taken'));
  const typed = {
    'Nome completo': 'Nome Digitado',
    Cargo: 'Cargo Digitado',
    Setor: 'Setor Digitado',
    'Data de admissão': '2020-02-02',
    Telefone: '(11) 91234-5678',
    'E-mail': 'digitado@exemplo.com',
  };

  await page.goto('/staff/new');
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  for (const [label, value] of Object.entries(typed)) await page.getByLabel(label, { exact: true }).fill(value);
  await save(page).click();

  await expect(page.getByLabel('CPF', { exact: true })).toHaveAccessibleDescription('Já existe um funcionário com este CPF.');
  for (const [label, value] of Object.entries(typed)) {
    await expect(page.getByLabel(label, { exact: true }), `novo: ${label}`).toHaveValue(value);
  }

  await page.goto(`/staff/${STAFF_ID}/edit`);
  await page.getByLabel('CPF', { exact: true }).fill('111.444.777-35');
  for (const [label, value] of Object.entries(typed)) await page.getByLabel(label, { exact: true }).fill(value);
  await save(page).click();

  await expect(page.getByLabel('CPF', { exact: true })).toHaveAccessibleDescription('Já existe um funcionário com este CPF.');
  for (const [label, value] of Object.entries(typed)) {
    await expect(page.getByLabel(label, { exact: true }), `edição: ${label}`).toHaveValue(value);
  }
});

test('ficha_formats_cpf_phone_hired_at_and_status_with_dash_for_null', async ({ page, api }) => {
  const eleven = staffOf();
  const ten = staffOf({
    id: '018f0000-0000-7000-8000-000000000412',
    name: 'Bruno Lima',
    status: 'inactive',
    phone: '1134567890',
    department: null,
    email: null,
  });

  for (const role of STAFF_ROLES) {
    serveStaffAs(api, role, state({ staff: [eleven, ten] }));

    await page.goto(`/staff/${eleven.id}`);
    await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true }), role).toBeVisible();
    await expect(field(page, 'Situação'), role).toHaveText('Ativo');
    await expect(field(page, 'CPF'), role).toHaveText('529.982.247-25');
    await expect(field(page, 'Cargo'), role).toHaveText('Fisioterapeuta Esportiva');
    await expect(field(page, 'Setor'), role).toHaveText('Reabilitação');
    await expect(field(page, 'Data de admissão'), role).toHaveText('15/03/2021');
    await expect(field(page, 'Telefone'), role).toHaveText('(11) 91234-5678');
    await expect(field(page, 'E-mail'), role).toHaveText('rafaela.prado@exemplo.com');

    await page.goto(`/staff/${ten.id}`);
    await expect(page.getByRole('heading', { name: 'Bruno Lima', exact: true }), role).toBeVisible();
    await expect(field(page, 'Situação'), role).toHaveText('Inativo');
    await expect(field(page, 'Telefone'), role).toHaveText('(11) 3456-7890');
    await expect(field(page, 'Setor'), role).toHaveText('—');
    await expect(field(page, 'E-mail'), role).toHaveText('—');
  }
});

test('ficha_access_block_without_user_and_with_each_of_four_roles', async ({ page, api }) => {
  const labels = { admin: 'Administrador', reception: 'Recepção', hr_finance: 'RH/Financeiro', instructor: 'Instrutor' };
  const cases = [
    { role: 'admin', active: true },
    { role: 'reception', active: false },
    { role: 'hr_finance', active: true },
    { role: 'instructor', active: false },
  ] as const;

  serveStaffAs(api, 'hr_finance', state());
  await page.goto(`/staff/${STAFF_ID}`);
  await expect(access(page)).toContainText('Sem usuário vinculado');

  for (const [index, { role, active }] of cases.entries()) {
    const user = userOf(index + 1, { role, active });
    serveStaffAs(api, 'hr_finance', state({ staff: [staffOf({ user: linkedOf(user) })] }));

    await page.goto(`/staff/${STAFF_ID}`);

    await expect(access(page).getByText(user.email, { exact: true }), role).toBeVisible();
    await expect(access(page).getByText(labels[role], { exact: true }), role).toBeVisible();
    await expect(access(page).getByText('Ativo', { exact: true }), role).toHaveCount(active ? 1 : 0);
    await expect(access(page).getByText('Inativo', { exact: true }), role).toHaveCount(active ? 0 : 1);
    await expect(access(page).getByText('Sem usuário vinculado'), role).toHaveCount(0);
  }
});

test('ficha_buttons_editar_and_inativar_or_reativar', async ({ page, api }) => {
  for (const role of STAFF_ROLES) {
    for (const status of ['active', 'inactive'] as const) {
      serveStaffAs(api, role, state({ staff: [staffOf({ status })] }));

      await page.goto(`/staff/${STAFF_ID}`);

      await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha' })).toBeVisible();
      expect(await controls(page, 'Editar'), `${role} ${status}: Editar`).toBe(1);
      expect(await controls(page, 'Inativar'), `${role} ${status}: Inativar`).toBe(status === 'active' ? 1 : 0);
      expect(await controls(page, 'Reativar'), `${role} ${status}: Reativar`).toBe(status === 'inactive' ? 1 : 0);
    }
  }
});

test('inactivate_confirms_naming_the_staff_then_deletes', async ({ page, api }) => {
  for (const role of STAFF_ROLES) {
    api.requests.length = 0;
    serveStaffAs(api, role, state());
    const deletes = () => api.requests.filter((request) => request.method === 'DELETE');

    await page.goto(`/staff/${STAFF_ID}`);
    await page.getByRole('button', { name: 'Inativar', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog, role).toContainText('Rafaela Prado Cunha');
    expect(deletes(), `${role}: antes de confirmar`).toHaveLength(0);

    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog, role).toHaveCount(0);
    expect(deletes(), `${role}: cancelar`).toHaveLength(0);

    await page.getByRole('button', { name: 'Inativar', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Inativar', exact: true }).click();

    await expect(field(page, 'Situação'), role).toHaveText('Inativo');
    await expect(page.getByRole('button', { name: 'Reativar', exact: true }), role).toBeVisible();
    expect(deletes().map((request) => `${request.method} ${request.path}`), role).toEqual([`DELETE ${ROUTE}`]);
  }
});

test('inactive_staff_with_active_user_shows_warning_in_four_cases', async ({ page, api }) => {
  const WARNING = 'Este funcionário está inativo e o usuário vinculado continua ativo.';
  const user = (active: boolean) => linkedOf(userOf(1, { active }));
  const cases = [
    { name: 'inativo com usuário ativo', staff: staffOf({ status: 'inactive', user: user(true) }), shown: true },
    { name: 'ativo com usuário ativo', staff: staffOf({ status: 'active', user: user(true) }), shown: false },
    { name: 'inativo com usuário inativo', staff: staffOf({ status: 'inactive', user: user(false) }), shown: false },
    { name: 'inativo sem vínculo', staff: staffOf({ status: 'inactive', user: null }), shown: false },
  ];

  for (const { name, staff, shown } of cases) {
    serveStaffAs(api, 'hr_finance', state({ staff: [staff] }));

    await page.goto(`/staff/${STAFF_ID}`);

    await expect(page.getByRole('heading', { name: staff.name }), name).toBeVisible();
    await expect(page.getByText(WARNING, { exact: true }), name).toHaveCount(shown ? 1 : 0);
  }
});

test('admin_links_and_unlinks_user_with_options_ordered_by_name', async ({ page, api }) => {
  // fora de ordem de nome: quem ordena é a tela
  const users = [
    userOf(1, { name: 'Zélia Nunes', email: 'zelia@exemplo.com' }),
    userOf(2, { name: 'Bruno Lima', email: 'bruno@exemplo.com' }),
    userOf(3, { name: 'Ângela Reis', email: 'angela@exemplo.com' }),
    userOf(4, { name: 'Ana Souza', email: 'ana@exemplo.com' }),
  ];
  serveStaffAs(api, 'admin', state({ users }));

  await page.goto(`/staff/${STAFF_ID}`);

  const select = page.getByLabel('Usuário vinculado', { exact: true });
  expect(await select.locator('option').allTextContents()).toEqual([
    'Nenhum',
    'Ana Souza (ana@exemplo.com)',
    'Ângela Reis (angela@exemplo.com)',
    'Bruno Lima (bruno@exemplo.com)',
    'Zélia Nunes (zelia@exemplo.com)',
  ]);
  await expect(page.getByRole('button', { name: 'Salvar vínculo', exact: true })).toBeVisible();

  await select.selectOption({ label: 'Bruno Lima (bruno@exemplo.com)' });
  await page.getByRole('button', { name: 'Salvar vínculo', exact: true }).click();

  await expect(access(page).getByText('bruno@exemplo.com', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const linking = api.requests.filter((request) => request.path === `${ROUTE}/user`);
  expect(linking.map((request) => `${request.method} ${request.path}`)).toEqual([`PUT ${ROUTE}/user`]);
  expect(linking[0]!.body).toEqual({ userId: users[1]!.id });

  await select.selectOption({ label: 'Nenhum' });
  await page.getByRole('button', { name: 'Salvar vínculo', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(access(page).getByText('Sem usuário vinculado')).toBeVisible();
  const unlinking = api.requests.filter((request) => request.path === `${ROUTE}/user`);
  expect(unlinking.map((request) => `${request.method} ${request.path}`)).toEqual([
    `PUT ${ROUTE}/user`,
    `DELETE ${ROUTE}/user`,
  ]);
  expect(unlinking[1]!.body).toBeUndefined();
});

test('hr_finance_sees_access_block_without_link_field_or_users_request', async ({ page, api }) => {
  const user = userOf(1, { name: 'Ana Souza', email: 'ana@exemplo.com', role: 'reception' });
  serveStaffAs(api, 'hr_finance', state({ staff: [staffOf({ user: linkedOf(user) })], users: [user] }));

  await page.goto(`/staff/${STAFF_ID}`);

  await expect(access(page).getByText('ana@exemplo.com', { exact: true })).toBeVisible();
  await expect(access(page).getByText('Recepção', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Usuário vinculado', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar vínculo', exact: true })).toHaveCount(0);
  expect(api.requests.filter((request) => request.path === '/api/users')).toHaveLength(0);
});

test('link_conflict_message_and_users_load_failure_message', async ({ page, api }) => {
  const [current, other] = [userOf(1, { name: 'Ana Souza' }), userOf(2, { name: 'Bruno Lima' })];
  serveStaffAs(api, 'admin', state({ staff: [staffOf({ user: linkedOf(current) })], users: [current, other] }));
  api.on('PUT', `${ROUTE}/user`, problem(409, 'user_already_linked'));

  await page.goto(`/staff/${STAFF_ID}`);
  await page.getByLabel('Usuário vinculado', { exact: true }).selectOption({ label: `Bruno Lima (${other.email})` });
  await page.getByRole('button', { name: 'Salvar vínculo', exact: true }).click();

  await expect(page.getByText('Este usuário já está vinculado a outro funcionário.', { exact: true })).toBeVisible();
  // o vínculo de antes continua à vista
  await expect(access(page).getByText(current.email, { exact: true })).toBeVisible();
  await expect(access(page).getByText(other.email, { exact: true })).toHaveCount(0);

  api.on('GET', '/api/users', { status: 500 });
  await page.goto(`/staff/${STAFF_ID}`);

  await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true })).toBeVisible();
  await expect(field(page, 'CPF')).toHaveText('529.982.247-25');
  await expect(page.getByText('Não foi possível carregar os usuários.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Usuário vinculado', { exact: true })).toHaveCount(0);
});

test('unknown_staff_shows_not_found_on_ficha_and_edit', async ({ page, api }) => {
  for (const role of STAFF_ROLES) {
    serveStaffAs(api, role, state({ staff: [] }));
    api.on('GET', ROUTE, problem(404, 'not_found'));

    for (const path of [`/staff/${STAFF_ID}`, `/staff/${STAFF_ID}/edit`]) {
      await page.goto(path);

      await expect(page.getByText('Funcionário não encontrado.', { exact: true }), `${role} ${path}`).toBeVisible();
    }
  }
});

test('new_form_omits_empty_optionals_and_edit_form_sends_null_for_cleared', async ({ page, api }) => {
  serveStaffAs(api, 'hr_finance', state());
  const fill = async (values: Record<string, string>) => {
    for (const [label, value] of Object.entries(values)) await page.getByLabel(label, { exact: true }).fill(value);
  };
  const required = {
    'Nome completo': 'Nome Digitado',
    CPF: '529.982.247-25',
    Cargo: 'Cargo Digitado',
    'Data de admissão': '2020-02-02',
    Telefone: '(11) 91234-5678',
  };
  const sentOnce = async () => {
    await expect.poll(() => staffWrites(api).length).toBe(1);
    const [write] = staffRequests(api).filter((request) => request.method !== 'GET');
    api.requests.length = 0;
    return write!;
  };

  // cadastro só com os obrigatórios: sem as chaves `department` e `email`
  await page.goto('/staff/new');
  await formHydrated(page);
  await fill(required);
  await save(page).click();
  const withoutOptionals = await sentOnce();
  expect(`${withoutOptionals.method} ${withoutOptionals.path}`).toBe('POST /api/staff');
  expect(withoutOptionals.body).toEqual({
    name: 'Nome Digitado',
    cpf: '529.982.247-25',
    position: 'Cargo Digitado',
    hiredAt: '2020-02-02',
    phone: '(11) 91234-5678',
  });
  expect(Object.keys(withoutOptionals.body as object)).not.toContain('department');
  expect(Object.keys(withoutOptionals.body as object)).not.toContain('email');

  // cadastro com os dois preenchidos: as duas chaves vão
  await page.goto('/staff/new');
  await formHydrated(page);
  await fill({ ...required, CPF: '111.444.777-35', Setor: 'Setor Digitado', 'E-mail': 'digitado@exemplo.com' });
  await save(page).click();
  const withOptionals = await sentOnce();
  expect(withOptionals.body).toMatchObject({ department: 'Setor Digitado', email: 'digitado@exemplo.com' });

  // edição: apagar "Setor" e "E-mail" preenchidos envia `null` nos dois
  await page.goto(`/staff/${STAFF_ID}/edit`);
  await formHydrated(page);
  await page.getByLabel('Setor', { exact: true }).fill('');
  await page.getByLabel('E-mail', { exact: true }).fill('');
  await save(page).click();
  const cleared = await sentOnce();
  expect(`${cleared.method} ${cleared.path}`).toBe(`PATCH ${ROUTE}`);
  expect(cleared.body).toEqual({ department: null, email: null });

  // edição: mudar só "Cargo" envia `position` com o valor digitado
  await page.goto(`/staff/${STAFF_ID}/edit`);
  await formHydrated(page);
  await page.getByLabel('Cargo', { exact: true }).fill('Fisioterapeuta Sênior');
  await save(page).click();
  const changed = await sentOnce();
  expect(`${changed.method} ${changed.path}`).toBe(`PATCH ${ROUTE}`);
  expect(changed.body).toEqual({ position: 'Fisioterapeuta Sênior' });
});

test('reativar_sends_patch_active_without_dialog', async ({ page, api }) => {
  for (const role of STAFF_ROLES) {
    api.requests.length = 0;
    serveStaffAs(api, role, state({ staff: [staffOf({ status: 'inactive' })] }));

    await page.goto(`/staff/${STAFF_ID}`);
    await page.getByRole('button', { name: 'Reativar', exact: true }).click();

    await expect(page.getByRole('dialog'), role).toHaveCount(0);
    await expect(field(page, 'Situação'), role).toHaveText('Ativo');
    await expect(page.getByRole('button', { name: 'Inativar', exact: true }), role).toBeVisible();
    const writes = staffRequests(api).filter((request) => request.method !== 'GET');
    expect(writes.map((request) => `${request.method} ${request.path}`), role).toEqual([`PATCH ${ROUTE}`]);
    expect(writes[0]!.body, role).toEqual({ status: 'active' });
  }
});

test('save_button_disabled_while_waiting_on_both_forms', async ({ page, api }) => {
  serveStaffAs(api, 'hr_finance', state());
  api.on('POST', '/api/staff', 'hang');
  api.on('PATCH', ROUTE, 'hang');

  await page.goto('/staff/new');
  await page.getByLabel('Nome completo', { exact: true }).fill('Funcionária Esperando');
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByLabel('Cargo', { exact: true }).fill('Fisioterapeuta');
  await page.getByLabel('Data de admissão', { exact: true }).fill('2021-03-15');
  await page.getByLabel('Telefone', { exact: true }).fill('11912345678');
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  await expect.poll(() => staffWrites(api).length).toBe(1);

  await page.goto(`/staff/${STAFF_ID}/edit`);
  await page.getByLabel('Cargo', { exact: true }).fill('Coordenadora');
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  await expect.poll(() => staffWrites(api).length).toBe(2);
});

test('ficha_render_asks_for_the_ficha_once_and_for_nothing_else_in_staff', async ({ page, api }) => {
  for (const role of STAFF_ROLES) {
    api.requests.length = 0;
    serveStaffAs(api, role, state({ staff: [staffOf()] }));

    await page.goto(`/staff/${STAFF_ID}`);
    await expect(page.getByRole('heading', { name: staffOf().name }), role).toBeVisible();
    await page.waitForTimeout(1000);

    const staff = staffRequests(api).map((request) => `${request.method} ${request.path}`);
    expect(staff, role).toEqual([`GET ${ROUTE}`]);
  }
});

test('edit_render_asks_for_the_ficha_once_and_for_nothing_else_in_staff', async ({ page, api }) => {
  for (const role of STAFF_ROLES) {
    api.requests.length = 0;
    serveStaffAs(api, role, state({ staff: [staffOf()] }));

    await page.goto(`/staff/${STAFF_ID}/edit`);
    await expect(page.getByLabel('Nome completo', { exact: true }), role).toHaveValue(staffOf().name);
    await page.waitForTimeout(1000);

    const staff = staffRequests(api).map((request) => `${request.method} ${request.path}`);
    expect(staff, role).toEqual([`GET ${ROUTE}`]);
  }
});

test('denied_profiles_ask_for_no_staff_data_on_any_of_the_four_pages', async ({ page, api }) => {
  for (const role of DENIED_ROLES) {
    api.requests.length = 0;
    serveStaffAs(api, role, state({ staff: [staffOf()] }));

    for (const path of FOUR_URLS) {
      await page.goto(path);
      await expect(page.getByText(NO_PERMISSION, { exact: true }), `${role} ${path}`).toBeVisible();
    }
    await page.waitForTimeout(1000);

    const reads = staffRequests(api).filter((request) => request.method === 'GET' && request.path !== '/api/staff/new');
    expect(reads.map((request) => `${request.method} ${request.path}`), role).toEqual([]);
  }
});

test('hired_at_follows_the_sao_paulo_day_not_the_browser_clock_on_both_forms', async ({ browser, api, baseURL }) => {
  const created = staffOf({ id: '018f0000-0000-7000-8000-000000000499' });
  serveStaffAs(api, 'hr_finance', state({ staff: [created, staffOf()] }));
  api.on('POST', '/api/staff', { status: 201, body: created });
  api.on('PATCH', ROUTE, { status: 200, body: staffOf() });
  // 02:30 UTC de 5/10 são 23:30 de 4/10 em São Paulo; o navegador está em UTC
  const context = await browser.newContext({ baseURL, timezoneId: 'UTC' });
  try {
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-04T23:30:00-03:00'));

    for (const path of ['/staff/new', `/staff/${STAFF_ID}/edit`]) {
      await page.goto(path);
      if (path === '/staff/new') {
        await page.getByLabel('Nome completo', { exact: true }).fill('Funcionária Do Dia');
        await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
        await page.getByLabel('Cargo', { exact: true }).fill('Fisioterapeuta Esportiva');
        await page.getByLabel('Telefone', { exact: true }).fill('(11) 91234-5678');
      }
      const hiredAt = page.getByLabel('Data de admissão', { exact: true });
      const before = staffWrites(api).length;

      await hiredAt.fill('2026-10-05');
      await save(page).click();
      await expect(hiredAt, `${path} amanhã em São Paulo`).toHaveAccessibleDescription(/.+/);
      expect(staffWrites(api), `${path} amanhã em São Paulo`).toHaveLength(before);

      await hiredAt.fill('2026-10-04');
      await save(page).click();
      await expect(page, `${path} hoje em São Paulo`).toHaveURL(/\/staff\/(?!new$)[^/]+$/);
      expect(staffWrites(api), `${path} hoje em São Paulo`).toHaveLength(before + 1);
    }
  } finally {
    await context.close();
  }
});
