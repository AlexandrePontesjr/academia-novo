import { AUDIT_ACTIONS, type AuditLog, type Role } from '@academia/contracts';
import { expect, type FakeApi, problem, sessionOf, test, userOf } from './support/fake-api.ts';

const USERS = [userOf(1), userOf(2), userOf(3, { name: 'Marina Duarte' })];

let rows = 0;
function logOf(overrides: Partial<AuditLog> = {}): AuditLog {
  rows += 1;
  return {
    id: `018f0000-0000-7000-8000-00000000a${String(rows).padStart(3, '0')}`,
    createdAt: '2026-10-04T15:04:05.000Z',
    user: { id: USERS[2]!.id, name: 'Marina Duarte' },
    action: 'user.updated',
    entity: 'user',
    entityId: USERS[0]!.id,
    ip: '203.0.113.7',
    userAgent: 'Navegador de teste/1.0',
    diff: null,
    ...overrides,
  };
}

/** Um administrador com a trilha e a lista de usuários que a tela pede. */
function serve(api: FakeApi, items: AuditLog[], nextCursor: string | null = null) {
  api.session = sessionOf('admin');
  api.on('GET', '/api/users', { status: 200, body: { users: USERS } });
  api.on('GET', '/api/audit-logs', { status: 200, body: { items, nextCursor } });
}

const auditCalls = (api: FakeApi) =>
  api.requests.filter((request) => request.method === 'GET' && request.path === '/api/audit-logs');

test('server_render_forwards_client_ip_and_user_agent', async ({ browser, api, baseURL }) => {
  api.session = sessionOf('admin');
  api.on('GET', '/api/users', { status: 200, body: { users: [userOf(1)] } });
  const context = await browser.newContext({
    baseURL,
    userAgent: 'teste/1.0',
    extraHTTPHeaders: { 'X-Forwarded-For': '203.0.113.7' },
  });
  try {
    const page = await context.newPage();

    await page.goto('/users');

    await expect(page.getByRole('table')).toBeVisible();
    for (const path of ['/api/auth/session', '/api/users']) {
      const calls = api.requests.filter((request) => request.method === 'GET' && request.path === path);
      expect(calls.length, path).toBeGreaterThanOrEqual(1);
      for (const call of calls) {
        expect(call.headers['user-agent'], path).toBe('teste/1.0');
        expect(call.headers['x-forwarded-for'], path).toBe('203.0.113.7');
      }
    }
  } finally {
    await context.close();
  }
});

test('anonymous_audit_redirects_to_login', async ({ page, api }) => {
  expect(api.session).toBeUndefined();

  await page.goto('/audit');

  await expect(page).toHaveURL('/login');
});

test('non_admin_sees_no_permission_and_no_trail', async ({ page, api }) => {
  const items = [
    logOf({ ip: '198.51.100.23', userAgent: 'Agente secreto/9.9' }),
    logOf({ ip: '198.51.100.24', userAgent: 'Outro agente/8.8' }),
  ];
  const roles = ['reception', 'hr_finance', 'instructor'] satisfies Role[];
  expect(roles).toHaveLength(3);

  for (const role of roles) {
    // mesmo que a API entregasse a trilha, a tela não a mostra
    serve(api, items);
    api.session = sessionOf(role);

    await page.goto('/audit');

    await expect(
      page.getByText('Você não tem permissão para acessar esta página.', { exact: true }),
      role,
    ).toBeVisible();
    const content = await page.content();
    for (const item of items) {
      expect(content, role).not.toContain(item.ip!);
      expect(content, role).not.toContain(item.userAgent!);
    }
    await expect(page.getByRole('table'), role).toHaveCount(0);
  }
});

test('audit_table_title_seven_columns_and_order', async ({ page, api }) => {
  // fora da ordem de data: quem ordena é a API, e a tela mantém a ordem que recebeu
  const items = [
    logOf({ ip: '203.0.113.1', createdAt: '2026-10-04T15:00:00.000Z' }),
    logOf({ ip: '203.0.113.3', createdAt: '2026-10-04T17:00:00.000Z' }),
    logOf({ ip: '203.0.113.2', createdAt: '2026-10-04T16:00:00.000Z' }),
  ];
  serve(api, items);

  await page.goto('/audit');

  await expect(page.getByRole('heading', { name: 'Auditoria', exact: true })).toBeVisible();
  expect(await page.getByRole('columnheader').allTextContents()).toEqual([
    'Data e hora',
    'Usuário',
    'Ação',
    'Alvo',
    'IP',
    'Navegador',
    'Detalhes',
  ]);
  const body = page.locator('tbody tr');
  await expect(body).toHaveCount(3);
  expect(await body.locator('td:nth-child(5)').allTextContents()).toEqual(['203.0.113.1', '203.0.113.3', '203.0.113.2']);
});

test('instants_shown_in_sao_paulo_time', async ({ page, api }) => {
  serve(api, [
    logOf({ createdAt: '2026-10-04T15:04:05.000Z' }),
    logOf({ createdAt: '2026-10-05T02:30:00.000Z' }),
  ]);

  await page.goto('/audit');

  expect(await page.locator('tbody tr td:nth-child(1)').allTextContents()).toEqual([
    '04/10/2026 12:04:05',
    '04/10/2026 23:30:00',
  ]);
});

test('ten_actions_shown_by_label', async ({ page, api }) => {
  expect(AUDIT_ACTIONS).toHaveLength(18);
  serve(
    api,
    AUDIT_ACTIONS.map((action) => logOf({ action })),
  );

  await page.goto('/audit');

  expect(await page.locator('tbody tr td:nth-child(3)').allTextContents()).toEqual([
    'Login',
    'Falha de login',
    'Logout',
    'Troca da própria senha',
    '2FA ativado',
    '2FA desativado',
    'Usuário criado',
    'Usuário editado',
    'Senha redefinida',
    '2FA zerado',
    'Aluno criado',
    'Aluno editado',
    'Aluno inativado',
    'Responsável do aluno salvo',
    'Consentimento registrado',
    'Consentimento revogado',
    'Foto do aluno enviada',
    'Foto do aluno removida',
  ]);
});

const LABELS = [
  'Login',
  'Falha de login',
  'Logout',
  'Troca da própria senha',
  '2FA ativado',
  '2FA desativado',
  'Usuário criado',
  'Usuário editado',
  'Senha redefinida',
  '2FA zerado',
  'Aluno criado',
  'Aluno editado',
  'Aluno inativado',
  'Responsável do aluno salvo',
  'Consentimento registrado',
  'Consentimento revogado',
  'Foto do aluno enviada',
  'Foto do aluno removida',
];

test('student_actions_labelled_and_filter_has_thirteen', async ({ page, api }) => {
  const studentActions = ['student.created', 'student.updated', 'student.inactivated'] as const;
  serve(
    api,
    studentActions.map((action) => logOf({ action, entity: 'student' })),
  );

  await page.goto('/audit');

  expect(await page.locator('tbody tr td:nth-child(3)').allTextContents()).toEqual([
    'Aluno criado',
    'Aluno editado',
    'Aluno inativado',
  ]);
  const options = await page.getByLabel('Ação', { exact: true }).locator('option').allTextContents();
  expect(options).toEqual(['Todas', ...LABELS]);
  expect(options.slice(1)).toHaveLength(18);
  expect(options.slice(11, 14)).toEqual(['Aluno criado', 'Aluno editado', 'Aluno inativado']);
});

test('student_details_show_status_change_and_changed_phone', async ({ page, api }) => {
  serve(api, [
    logOf({
      action: 'student.updated',
      entity: 'student',
      diff: { fields: ['phone', 'status'], values: { status: { from: 'active', to: 'suspended' } } },
    }),
    logOf({
      action: 'student.updated',
      entity: 'student',
      diff: { fields: ['status'], values: { status: { from: 'inactive', to: 'active' } } },
    }),
  ]);

  await page.goto('/audit');

  const first = page.locator('tbody tr:nth-child(1) td:nth-child(7)');
  await expect(first.getByText('Situação: Ativo → Suspenso', { exact: true })).toBeVisible();
  await expect(first.getByText('Telefone alterado', { exact: true })).toBeVisible();
  const second = page.locator('tbody tr:nth-child(2) td:nth-child(7)');
  await expect(second.getByText('Situação: Inativo → Ativo', { exact: true })).toBeVisible();
});

test('student_target_links_to_the_ficha', async ({ page, api }) => {
  const studentId = '018f0000-0000-7000-8000-0000000005aa';
  serve(api, [
    logOf({ action: 'student.created', entity: 'student', entityId: studentId }),
    logOf({ entity: 'user', entityId: USERS[1]!.id }),
  ]);

  await page.goto('/audit');

  const student = page.locator('tbody tr:nth-child(1) td:nth-child(4)');
  await expect(student.getByRole('link', { name: 'Ver aluno', exact: true })).toHaveAttribute(
    'href',
    `/students/${studentId}`,
  );
  await expect(page.locator('tbody tr:nth-child(2) td:nth-child(4)')).toHaveText('Pessoa 2');
  await expect(page.locator('tbody tr:nth-child(2) td:nth-child(4)').getByRole('link')).toHaveCount(0);
});

test('row_without_author_shows_dash', async ({ page, api }) => {
  serve(api, [logOf({ user: null })]);

  await page.goto('/audit');

  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr td:nth-child(2)')).toHaveText('—');
});

test('target_shows_current_user_name', async ({ page, api }) => {
  expect(USERS[1]!.name).toBe('Pessoa 2');
  serve(api, [logOf({ entity: 'user', entityId: USERS[1]!.id })]);

  await page.goto('/audit');

  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr td:nth-child(4)')).toHaveText('Pessoa 2');
});

test('row_without_target_shows_dash', async ({ page, api }) => {
  serve(api, [logOf({ action: 'auth.login_failed', user: null, entityId: null })]);

  await page.goto('/audit');

  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr td:nth-child(4)')).toHaveText('—');
});

test('details_show_role_change_and_changed_name', async ({ page, api }) => {
  serve(api, [
    logOf({ diff: { fields: ['name', 'role'], values: { role: { from: 'reception', to: 'admin' } } } }),
  ]);

  await page.goto('/audit');

  const details = page.locator('tbody tr td:nth-child(7)');
  await expect(details.getByText('Perfil: Recepção → Administrador', { exact: true })).toBeVisible();
  await expect(details.getByText('Nome alterado', { exact: true })).toBeVisible();
});

test('five_filters_and_two_buttons_above_the_table', async ({ page, api }) => {
  serve(api, [logOf()]);

  await page.goto('/audit');

  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  const tableTop = (await table.boundingBox())!.y;
  const controls = [
    ...['De', 'Até', 'Usuário', 'Ação', 'IP'].map((label) => page.getByLabel(label, { exact: true })),
    ...['Filtrar', 'Limpar filtros'].map((name) => page.getByRole('button', { name, exact: true })),
  ];
  expect(controls).toHaveLength(7);
  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(tableTop);
  }
});

test('filter_puts_filters_in_url_and_day_bounds_in_sao_paulo', async ({ page, api }) => {
  const filtered = [logOf({ action: 'auth.login_failed', ip: '203.0.113.7', userAgent: 'Só a filtrada/1.0' })];
  serve(api, [logOf({ userAgent: 'Sem filtro/1.0' }), logOf({ userAgent: 'Sem filtro/2.0' })]);
  api.on('GET', '/api/audit-logs', (request) => ({
    status: 200,
    body: {
      items: request.query === '' ? [logOf({ userAgent: 'Sem filtro/1.0' }), logOf({ userAgent: 'Sem filtro/2.0' })] : filtered,
      nextCursor: null,
    },
  }));
  await page.goto('/audit');
  await expect(page.locator('tbody tr')).toHaveCount(2);

  await page.getByLabel('De', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Até', { exact: true }).fill('2026-10-04');
  await page.getByLabel('Usuário', { exact: true }).selectOption({ label: 'Pessoa 2' });
  await page.getByLabel('Ação', { exact: true }).selectOption({ label: 'Falha de login' });
  await page.getByLabel('IP', { exact: true }).fill('203.0.113.7');
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();

  await expect(page.locator('tbody tr')).toHaveCount(1);
  const url = new URL(page.url());
  expect(url.pathname).toBe('/audit');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    from: '2026-10-01',
    to: '2026-10-04',
    userId: USERS[1]!.id,
    action: 'auth.login_failed',
    ip: '203.0.113.7',
  });
  const sent = new URLSearchParams(auditCalls(api).at(-1)!.query);
  expect(Object.fromEntries(sent)).toEqual({
    from: '2026-10-01T03:00:00.000Z',
    to: '2026-10-05T03:00:00.000Z',
    userId: USERS[1]!.id,
    action: 'auth.login_failed',
    ip: '203.0.113.7',
  });
  // só o que a API devolveu a essa chamada
  expect(await page.locator('tbody tr td:nth-child(6)').allTextContents()).toEqual(['Só a filtrada/1.0']);
});

test('next_page_link_keeps_filters_and_sends_cursor', async ({ page, api }) => {
  const cursor = '018f0000-0000-7000-8000-0000000000c1';
  api.session = sessionOf('admin');
  api.on('GET', '/api/users', { status: 200, body: { users: USERS } });
  api.on('GET', '/api/audit-logs', (request) =>
    new URLSearchParams(request.query).has('cursor')
      ? { status: 200, body: { items: [logOf({ action: 'auth.login_failed', ip: '198.51.100.2' })], nextCursor: null } }
      : { status: 200, body: { items: [logOf({ action: 'auth.login_failed', ip: '198.51.100.1' })], nextCursor: cursor } },
  );
  await page.goto('/audit?action=auth.login_failed');
  expect(await page.locator('tbody tr td:nth-child(5)').allTextContents()).toEqual(['198.51.100.1']);

  const next = page.getByRole('link', { name: 'Próxima página', exact: true });
  await expect(next).toBeVisible();
  await next.click();

  await expect(page.locator('tbody tr td:nth-child(5)')).toHaveText(['198.51.100.2']);
  const sent = new URLSearchParams(auditCalls(api).at(-1)!.query);
  expect(Object.fromEntries(sent)).toEqual({ action: 'auth.login_failed', cursor });
  await expect(page.getByRole('link', { name: 'Próxima página', exact: true })).toHaveCount(0);
});

test('empty_trail_shows_message_instead_of_table', async ({ page, api }) => {
  serve(api, []);

  await page.goto('/audit');

  await expect(page.getByText('Nenhum registro encontrado.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('load_failure_shows_retry', async ({ page, api }) => {
  serve(api, [logOf(), logOf()]);
  api.on('GET', '/api/audit-logs', problem(500, 'internal_error'));

  await page.goto('/audit');

  await expect(page.getByText('Não foi possível carregar a auditoria.', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Tentar novamente' });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  serve(api, [logOf(), logOf()]);
  await retry.click();

  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText('Não foi possível carregar a auditoria.')).toHaveCount(0);
});

test('query_errors_shown_on_five_filters', async ({ page, api }) => {
  const pairs: Array<[path: string, label: string]> = [
    ['from', 'De'],
    ['to', 'Até'],
    ['userId', 'Usuário'],
    ['action', 'Ação'],
    ['ip', 'IP'],
  ];
  expect(pairs).toHaveLength(5);

  for (const [path, label] of pairs) {
    const message = `Mensagem da API para ${path}`;
    serve(api, []);
    api.on('GET', '/api/audit-logs', problem(422, 'validation_failed', [{ path, message }]));

    await page.goto('/audit?ip=203.0.113.7');

    // a mensagem fica ligada ao filtro indicado em `path`, e só a ele
    await expect(page.getByLabel(label, { exact: true }), path).toHaveAccessibleDescription(message);
    await expect(page.getByText(message, { exact: true }), path).toHaveCount(1);
  }
});

test('clear_filters_goes_to_audit_without_query', async ({ page, api }) => {
  serve(api, [logOf()]);
  await page.goto('/audit?action=auth.login_failed&ip=203.0.113.7');
  await expect(page.getByLabel('IP', { exact: true })).toHaveValue('203.0.113.7');
  expect(auditCalls(api).at(-1)!.query).not.toBe('');
  const callsBefore = auditCalls(api).length;

  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();

  await expect(page).toHaveURL('/audit');
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByLabel('IP', { exact: true })).toHaveValue('');
  await expect.poll(() => auditCalls(api).length).toBeGreaterThan(callsBefore);
  expect(auditCalls(api).at(-1)!.query).toBe('');
});

test('consent_actions_labelled_and_filter_has_sixteen', async ({ page, api }) => {
  const consentActions = ['student.guardian_saved', 'student.consent_granted', 'student.consent_revoked'] as const;
  serve(
    api,
    consentActions.map((action) => logOf({ action, entity: 'student' })),
  );

  await page.goto('/audit');

  expect(await page.locator('tbody tr td:nth-child(3)').allTextContents()).toEqual([
    'Responsável do aluno salvo',
    'Consentimento registrado',
    'Consentimento revogado',
  ]);
  const options = await page.getByLabel('Ação', { exact: true }).locator('option').allTextContents();
  expect(options).toEqual(['Todas', ...LABELS]);
  expect(options.slice(1)).toHaveLength(18);
  expect(options.slice(14, 17)).toEqual(['Responsável do aluno salvo', 'Consentimento registrado', 'Consentimento revogado']);
  // a posição de cada uma é a 14, a 15 e a 16 do vocabulário
  expect(AUDIT_ACTIONS.slice(13, 16)).toEqual(consentActions);
});

test('consent_granted_details_show_purpose_version_and_grantor', async ({ page, api }) => {
  serve(api, [
    logOf({
      action: 'student.consent_granted',
      entity: 'student',
      diff: {
        fields: ['purpose', 'termVersion', 'grantedBy'],
        values: {
          purpose: { from: null, to: 'image_use' },
          termVersion: { from: null, to: 1 },
          grantedBy: { from: null, to: 'guardian' },
        },
      },
    }),
  ]);

  await page.goto('/audit');

  const details = page.locator('tbody tr:nth-child(1) td:nth-child(7)');
  await expect(details.getByText('Finalidade: — → Uso da imagem', { exact: true })).toBeVisible();
  await expect(details.getByText('Versão do termo: — → 1', { exact: true })).toBeVisible();
  await expect(details.getByText('Concedido por: — → Responsável', { exact: true })).toBeVisible();
});

test('guardian_saved_details_show_changed_phone', async ({ page, api }) => {
  serve(api, [
    logOf({
      action: 'student.guardian_saved',
      entity: 'student',
      diff: { fields: ['phone'], values: {} },
    }),
  ]);

  await page.goto('/audit');

  await expect(
    page.locator('tbody tr:nth-child(1) td:nth-child(7)').getByText('Telefone alterado', { exact: true }),
  ).toBeVisible();
});

test('photo_actions_labelled_and_filter_has_eighteen', async ({ page, api }) => {
  const photoActions = ['student.photo_uploaded', 'student.photo_removed'] as const;
  serve(
    api,
    photoActions.map((action) => logOf({ action, entity: 'student' })),
  );

  await page.goto('/audit');

  expect(await page.locator('tbody tr td:nth-child(3)').allTextContents()).toEqual([
    'Foto do aluno enviada',
    'Foto do aluno removida',
  ]);
  const options = await page.getByLabel('Ação', { exact: true }).locator('option').allTextContents();
  expect(options).toEqual(['Todas', ...LABELS]);
  expect(options.slice(1)).toHaveLength(18);
  // a posição de cada uma é a 17 e a 18 do vocabulário
  expect(options.slice(17)).toEqual(['Foto do aluno enviada', 'Foto do aluno removida']);
  expect(AUDIT_ACTIONS.slice(16)).toEqual(photoActions);
});
