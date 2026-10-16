import type { CheckInStatus } from '@academia/contracts';
import type { Page } from '@playwright/test';
import {
  CHECK_IN_ROLES,
  checkInRequests,
  checkInsPath,
  LATE,
  listItemOf,
  NO_CHECK_IN_ROLES,
  NO_PERMISSION,
  servePhotos,
  serveSearch,
  statusOf,
  statusPath,
  studentRequests,
  textsOf,
} from './support/check-ins.ts';
import { expect, type FakeApi, problem, sessionOf, test } from './support/fake-api.ts';

const field = (page: Page) => page.getByLabel('Nome ou CPF', { exact: true });
const results = (page: Page) => page.getByRole('list', { name: 'Alunos encontrados' }).getByRole('listitem');
const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const reasons = (page: Page, name: string) =>
  card(page, name).getByRole('list', { name: 'Motivos do bloqueio' }).getByRole('listitem');
const registerButton = (page: Page) => page.getByRole('button', { name: 'Registrar presença', exact: true });
const retry = (page: Page) => page.getByRole('button', { name: 'Tentar novamente', exact: true });
const LOAD_FAILED = 'Não foi possível carregar o aluno.';
const REGISTER_FAILED = 'Não foi possível registrar a presença.';
const NAME = 'Rafaela Prado Cunha';

async function searchFor(page: Page, text: string) {
  await field(page).fill(text);
  await field(page).press('Enter');
}

/** A busca devolve um aluno só, cuja situação é `status`; abre a página e busca por `text`. */
async function openCardOf(page: Page, api: FakeApi, status: CheckInStatus, text = '529.982.247-25', role = 'reception' as const) {
  const item = listItemOf(1, { id: status.student.id, name: status.student.name });
  serveSearch(api, role, [item]);
  servePhotos(api, [item.photoUrl, status.photoUrl]);
  api.on('GET', statusPath(status.student.id), { status: 200, body: status });
  await page.goto('/check-in');
  await searchFor(page, text);
  await expect(card(page, status.student.name)).toBeVisible();
}

const statusGets = (api: FakeApi, studentId: string) =>
  api.requests.filter((request) => request.method === 'GET' && request.path === statusPath(studentId));
const posts = (api: FakeApi, studentId: string) =>
  api.requests.filter((request) => request.method === 'POST' && request.path === checkInsPath(studentId));

test('hr_finance_and_instructor_see_no_permission_without_any_request', async ({ page, api }) => {
  for (const role of NO_CHECK_IN_ROLES) {
    api.requests = [];
    serveSearch(api, role, [listItemOf(1)]);

    await page.goto('/check-in');

    await expect(page.getByText(NO_PERMISSION, { exact: true }), role).toBeVisible();
    await expect(field(page), role).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(studentRequests(api), role).toHaveLength(0);
    expect(checkInRequests(api), role).toHaveLength(0);
  }
  expect(NO_CHECK_IN_ROLES).toEqual(['hr_finance', 'instructor']);
});

test('check_in_title_and_focused_name_or_cpf_field_without_card', async ({ page, api }) => {
  for (const role of CHECK_IN_ROLES) {
    api.session = sessionOf(role);

    await page.goto('/check-in');

    await expect(page.getByRole('heading', { name: 'Check-in', exact: true, level: 2 }), role).toBeVisible();
    await expect(field(page), role).toBeVisible();
    await expect(field(page), role).toBeFocused();
    await expect(field(page), role).toHaveValue('');
    await expect(page.getByRole('region'), role).toHaveCount(0);
    for (const text of ['Liberado', 'Bloqueado']) await expect(page.getByText(text, { exact: true }), role).toHaveCount(0);
    await expect(registerButton(page), role).toHaveCount(0);
  }
});

test('several_results_listed_in_api_order_with_thumb_name_status_and_choice_opens_card', async ({ page, api }) => {
  // fora da ordem alfabética: quem ordena é a API, e a tela mantém a ordem que recebeu
  const items = [
    listItemOf(1, { name: 'Carla', status: 'active' }),
    listItemOf(2, { name: 'Ana', status: 'inactive' }),
    listItemOf(3, { name: 'Bruno', status: 'suspended' }),
  ];
  serveSearch(api, 'reception', items);
  servePhotos(api, items.map((item) => item.photoUrl));
  const chosen = statusOf(items[1]!.id, { student: { id: items[1]!.id, name: 'Ana', status: 'inactive' } });
  api.on('GET', statusPath(chosen.student.id), { status: 200, body: chosen });

  await page.goto('/check-in');
  await searchFor(page, 'a');

  await expect(results(page)).toHaveCount(3);
  for (const [index, item] of items.entries()) {
    await expect(results(page).nth(index).locator('img'), item.name).toHaveAttribute('src', item.photoUrl!);
  }
  expect(await results(page).locator('span.flex-1').allTextContents()).toEqual(['Carla', 'Ana', 'Bruno']);
  for (const [index, label] of ['Ativo', 'Inativo', 'Suspenso'].entries()) {
    await expect(results(page).nth(index).getByText(label, { exact: true }), label).toBeVisible();
  }
  // nenhum cartão antes da escolha
  expect(api.requests.filter((request) => request.path.endsWith('/check-in-status'))).toHaveLength(0);

  await results(page).nth(1).getByRole('button').click();

  await expect(card(page, 'Ana')).toBeVisible();
  expect(api.requests.filter((request) => request.path.endsWith('/check-in-status')).map((request) => request.path)).toEqual([
    statusPath(items[1]!.id),
  ]);
});

test('single_result_opens_the_card_directly', async ({ page, api }) => {
  const status = statusOf(listItemOf(1).id);

  await openCardOf(page, api, status);

  await expect(page.getByRole('list', { name: 'Alunos encontrados' })).toHaveCount(0);
  expect(statusGets(api, status.student.id)).toHaveLength(1);
});

test('no_result_shows_nenhum_aluno_encontrado', async ({ page, api }) => {
  serveSearch(api, 'reception', []);

  await page.goto('/check-in');
  await searchFor(page, 'Ninguém');

  await expect(page.getByText('Nenhum aluno encontrado.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Alunos encontrados' })).toHaveCount(0);
});

test('card_shows_large_photo_or_initials_name_badge_and_plan_or_no_enrollment', async ({ page, api }) => {
  const id = listItemOf(1).id;
  const withPhoto = statusOf(id);
  await openCardOf(page, api, withPhoto);

  const shown = card(page, NAME);
  await expect(shown.getByRole('heading', { name: NAME, exact: true })).toBeVisible();
  await expect(shown.locator('img')).toHaveAttribute('src', withPhoto.photoUrl!);
  await expect(shown.getByText('Liberado', { exact: true })).toBeVisible();
  expect(await textsOf(shown.getByText('Mensal Plus · Mensal', { exact: true }))).toEqual(['Mensal Plus · Mensal']);
  await expect(shown.getByText('Vence em 14/10/2026', { exact: true })).toBeVisible();
  await expect(shown.getByText('Sem matrícula vigente', { exact: true })).toHaveCount(0);

  // sem foto e sem período: as iniciais e "Sem matrícula vigente"; a liberação é a da resposta, sem conta
  const bare = statusOf(id, { photoUrl: null, enrollment: null });
  await openCardOf(page, api, bare);
  const plain = card(page, NAME);
  await expect(plain.locator('img')).toHaveCount(0);
  await expect(plain.getByRole('img', { name: 'Sem foto' })).toHaveAttribute('data-initials', 'RC');
  await expect(plain.getByText('Sem matrícula vigente', { exact: true })).toBeVisible();
  await expect(plain.getByText('Liberado', { exact: true })).toBeVisible();
  await expect(plain.getByText(/Vence em/)).toHaveCount(0);
  await expect(plain.getByText(/Mensal Plus/)).toHaveCount(0);

  // bloqueado: o selo da resposta
  await openCardOf(page, api, statusOf(id, { access: 'blocked', blockReasons: ['student_inactive'] }));
  await expect(card(page, NAME).getByText('Bloqueado', { exact: true })).toBeVisible();
  await expect(card(page, NAME).getByText('Liberado', { exact: true })).toHaveCount(0);
});

test('blocked_card_lists_each_reason_label_without_register_button', async ({ page, api }) => {
  const id = listItemOf(1).id;
  const cases = [
    { blockReasons: ['student_inactive'], labels: ['Aluno inativo'] },
    { blockReasons: ['student_suspended'], labels: ['Aluno suspenso'] },
    { blockReasons: ['no_active_enrollment'], labels: ['Sem matrícula vigente'] },
    // dois motivos, na ordem da API
    { blockReasons: ['student_suspended', 'no_active_enrollment'], labels: ['Aluno suspenso', 'Sem matrícula vigente'] },
    { blockReasons: ['student_inactive', 'no_active_enrollment'], labels: ['Aluno inativo', 'Sem matrícula vigente'] },
  ] as const;

  for (const { blockReasons, labels } of cases) {
    await openCardOf(page, api, statusOf(id, { access: 'blocked', blockReasons: [...blockReasons] }));

    expect(await reasons(page, NAME).allTextContents(), labels.join()).toEqual(labels);
    await expect(card(page, NAME).getByText('Bloqueado', { exact: true }), labels.join()).toBeVisible();
    await expect(registerButton(page), labels.join()).toHaveCount(0);
  }
});

test('allowed_card_without_check_in_shows_register_button', async ({ page, api }) => {
  await openCardOf(page, api, statusOf(listItemOf(1).id));

  await expect(card(page, NAME).getByRole('button', { name: 'Registrar presença', exact: true })).toBeVisible();
  await expect(card(page, NAME).getByRole('list', { name: 'Motivos do bloqueio' })).toHaveCount(0);
});

test('already_checked_in_card_shows_sao_paulo_time_without_button', async ({ page, api }) => {
  await openCardOf(page, api, statusOf(listItemOf(1).id, { checkedInAt: LATE }));

  await expect(card(page, NAME).getByText('Presença já registrada hoje às 23:30.', { exact: true })).toBeVisible();
  await expect(registerButton(page)).toHaveCount(0);
  await expect(page.getByText(/02:30/)).toHaveCount(0);
});

test('register_201_shows_time_clears_and_refocuses_search', async ({ page, api }) => {
  const status = statusOf(listItemOf(1).id);
  api.on('POST', checkInsPath(status.student.id), {
    status: 201,
    body: { id: '018f0000-0000-7000-8000-0000000c3001', day: '2026-10-07', checkedInAt: LATE },
  });
  await openCardOf(page, api, status);
  await expect(field(page)).toHaveValue('529.982.247-25');

  await registerButton(page).click();

  await expect(page.getByText('Presença registrada às 23:30.', { exact: true })).toBeVisible();
  await expect(field(page)).toHaveValue('');
  await expect(field(page)).toBeFocused();
  await expect(registerButton(page)).toHaveCount(0);
  expect(posts(api, status.student.id)).toHaveLength(1);
  expect(api.writes().map((request) => `${request.method} ${request.path}`)).toEqual([`POST ${checkInsPath(status.student.id)}`]);
});

test('register_409_reloads_the_card_two_codes', async ({ page, api }) => {
  const id = listItemOf(1).id;

  // `already_checked_in`: a situação nova traz a presença, e a hora é a dela
  await openCardOf(page, api, statusOf(id));
  api.requests = [];
  api.on('GET', statusPath(id), { status: 200, body: statusOf(id, { checkedInAt: '2026-10-07T18:05:00.000Z' }) });
  api.on('POST', checkInsPath(id), problem(409, 'already_checked_in'));

  await registerButton(page).click();

  await expect(card(page, NAME).getByText('Presença já registrada hoje às 15:05.', { exact: true })).toBeVisible();
  await expect(registerButton(page)).toHaveCount(0);
  expect(statusGets(api, id)).toHaveLength(1);

  // `check_in_blocked`: a situação nova é bloqueada, com os motivos dela
  await openCardOf(page, api, statusOf(id));
  api.requests = [];
  api.on('GET', statusPath(id), {
    status: 200,
    body: statusOf(id, { access: 'blocked', blockReasons: ['student_suspended', 'no_active_enrollment'], enrollment: null }),
  });
  api.on('POST', checkInsPath(id), problem(409, 'check_in_blocked'));

  await registerButton(page).click();

  await expect(card(page, NAME).getByText('Bloqueado', { exact: true })).toBeVisible();
  expect(await reasons(page, NAME).allTextContents()).toEqual(['Aluno suspenso', 'Sem matrícula vigente']);
  await expect(registerButton(page)).toHaveCount(0);
  expect(statusGets(api, id)).toHaveLength(1);
});

test('search_card_and_register_failures_show_message_and_retry_keeping_the_field', async ({ page, api }) => {
  const status = statusOf(listItemOf(1).id);
  const item = listItemOf(1, { id: status.student.id, name: NAME });
  const typed = 'Rafaela';

  // a busca com `500`
  let down = true;
  api.session = sessionOf('reception');
  servePhotos(api, [item.photoUrl, status.photoUrl]);
  api.on('GET', '/api/students', () => (down ? { status: 500 } : { status: 200, body: { items: [item], nextCursor: null } }));
  api.on('GET', statusPath(status.student.id), { status: 200, body: status });
  await page.goto('/check-in');
  await searchFor(page, typed);

  await expect(page.getByText(LOAD_FAILED, { exact: true }), 'busca').toBeVisible();
  await expect(retry(page), 'busca').toBeVisible();
  await expect(field(page), 'busca').toHaveValue(typed);
  down = false;
  await retry(page).click();
  await expect(card(page, NAME), 'busca').toBeVisible();
  await expect(page.getByText(LOAD_FAILED, { exact: true }), 'busca').toHaveCount(0);

  // a situação com `500` e com `404`
  for (const failure of [{ status: 500 }, problem(404, 'not_found')]) {
    const label = `situação ${(failure as { status: number }).status}`;
    let statusDown = true;
    api.on('GET', statusPath(status.student.id), () => (statusDown ? failure : { status: 200, body: status }));
    await page.goto('/check-in');
    await searchFor(page, typed);

    await expect(page.getByText(LOAD_FAILED, { exact: true }), label).toBeVisible();
    await expect(retry(page), label).toBeVisible();
    await expect(field(page), label).toHaveValue(typed);
    await expect(card(page, NAME), label).toHaveCount(0);
    statusDown = false;
    await retry(page).click();
    await expect(card(page, NAME), label).toBeVisible();
  }

  // o registro com `500`
  api.on('GET', statusPath(status.student.id), { status: 200, body: status });
  let registerDown = true;
  api.on('POST', checkInsPath(status.student.id), () =>
    registerDown
      ? { status: 500 }
      : { status: 201, body: { id: '018f0000-0000-7000-8000-0000000c3002', day: '2026-10-07', checkedInAt: LATE } },
  );
  await page.goto('/check-in');
  await searchFor(page, typed);
  await registerButton(page).click();

  await expect(page.getByText(REGISTER_FAILED, { exact: true }), 'registro').toBeVisible();
  await expect(retry(page), 'registro').toBeVisible();
  await expect(field(page), 'registro').toHaveValue(typed);
  registerDown = false;
  await retry(page).click();
  await expect(page.getByText('Presença registrada às 23:30.', { exact: true }), 'registro').toBeVisible();
  expect(posts(api, status.student.id), 'registro').toHaveLength(2);
});

test('student_and_plan_markup_shown_as_literal_text_in_list_and_card', async ({ page, api }) => {
  const items = [listItemOf(1, { name: '<b>Ana</b>' }), listItemOf(2, { name: 'Bruno' })];
  serveSearch(api, 'reception', items);
  servePhotos(api, items.map((item) => item.photoUrl));
  const status = statusOf(items[0]!.id, {
    student: { id: items[0]!.id, name: '<b>Ana</b>', status: 'active' },
    enrollment: {
      id: '018f0000-0000-7000-8000-0000000a1002',
      plan: { id: '018f0000-0000-7000-8000-000000091002', name: '<i>Mensal</i>', period: 'monthly' },
      startsAt: '2026-09-15',
      endsAt: '2026-10-14',
    },
  });
  servePhotos(api, [status.photoUrl]);
  api.on('GET', statusPath(status.student.id), { status: 200, body: status });

  await page.goto('/check-in');
  await searchFor(page, 'Ana');

  await expect(results(page)).toHaveCount(2);
  expect(await results(page).locator('span.flex-1').allTextContents()).toEqual(['<b>Ana</b>', 'Bruno']);
  await expect(page.getByRole('main').locator('b')).toHaveCount(0);

  await results(page).nth(0).getByRole('button').click();

  const shown = card(page, '<b>Ana</b>');
  await expect(shown.getByRole('heading', { name: '<b>Ana</b>', exact: true })).toBeVisible();
  await expect(shown.getByText('<i>Mensal</i> · Mensal', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').locator('b')).toHaveCount(0);
  await expect(page.getByRole('main').locator('i')).toHaveCount(0);
});

test('search_card_and_register_request_exactly_the_flow_routes', async ({ page, api }) => {
  const status = statusOf(listItemOf(1).id);
  api.on('POST', checkInsPath(status.student.id), {
    status: 201,
    body: { id: '018f0000-0000-7000-8000-0000000c3003', day: '2026-10-07', checkedInAt: LATE },
  });
  await openCardOf(page, api, status, 'Ana Souza');

  // por nome: `q` é o texto digitado, e nenhum outro parâmetro
  const searches = () => api.requests.filter((request) => request.method === 'GET' && request.path === '/api/students');
  expect(searches().map((request) => [...new URLSearchParams(request.query)])).toEqual([[['q', 'Ana Souza']]]);
  expect(statusGets(api, status.student.id).map((request) => request.query)).toEqual(['']);

  // por CPF com máscara: segue como digitado
  await searchFor(page, '529.982.247-25');
  await expect.poll(() => searches().length).toBe(2);
  await expect.poll(() => statusGets(api, status.student.id).length).toBe(2);
  await expect(card(page, NAME)).toBeVisible();
  expect([...new URLSearchParams(searches()[1]!.query)]).toEqual([['q', '529.982.247-25']]);

  await registerButton(page).click();
  await expect(page.getByText('Presença registrada às 23:30.', { exact: true })).toBeVisible();

  const [post, ...others] = api.writes();
  expect(others).toEqual([]);
  expect(post!.method).toBe('POST');
  expect(post!.path).toBe(checkInsPath(status.student.id));
  expect(post!.query).toBe('');
  expect(post!.body).toBeUndefined();
  // nenhuma rota de dados além das três do fluxo (e o arquivo das fotos)
  const data = api.requests.filter((request) => request.path !== '/api/auth/session' && !request.path.startsWith('/api/files/'));
  expect([...new Set(data.map((request) => `${request.method} ${request.path}`))].sort()).toEqual(
    [`GET /api/students`, `GET ${statusPath(status.student.id)}`, `POST ${checkInsPath(status.student.id)}`].sort(),
  );
});

test('anonymous_check_in_redirects_to_login_without_requests', async ({ page, api }) => {
  expect(api.session).toBeUndefined();
  api.on('GET', '/api/students', { status: 200, body: { items: [listItemOf(1)], nextCursor: null } });

  await page.goto('/check-in');

  await expect(page).toHaveURL('/login');
  expect(api.requests.filter((request) => request.path !== '/api/auth/session')).toHaveLength(0);
});
