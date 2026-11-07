import type { MyProfile, StudentPayment } from '@academia/contracts';
import type { Locator, Page } from '@playwright/test';
import { expect, type FakeApi, problem, servePhotoFile, sessionOf, test } from './support/fake-api.ts';
import { DESKTOP, MOBILE, framesOf, settle, startSampling } from './support/motion.ts';
import { PHOTO_PATH, PHOTO_URL, pngFile } from './support/photo.ts';

const PENDING_PHOTO_PATH = '/api/photo-files/018f0000-0000-7000-8000-000000000998/medium';
const LOAD_ERROR = 'Não foi possível carregar seus dados agora. Tente de novo em instantes.';

/** As rotas da equipe que a sessão `student` nunca pode oferecer (AD-124). */
const TEAM_ROUTES = ['/dashboard', '/students', '/staff', '/plans', '/payments', '/check-in', '/check-ins', '/audit', '/users', '/privacy', '/account', '/leads'];

function profileOf(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    name: 'Ana Souza',
    cpf: '52998224725',
    birthDate: '2000-01-01',
    email: 'ana@example.com',
    phone: '11912345678',
    address: 'Rua das Flores, 10',
    emergencyContactName: 'Bia Lima',
    emergencyContactPhone: '11933334444',
    status: 'active',
    photoUrl: null,
    pendingPhoto: null,
    ...overrides,
  };
}

function periodOf(n: number, dueDate: string, status: StudentPayment['status'], overrides: Partial<StudentPayment> = {}): StudentPayment {
  return {
    enrollmentId: `018f0000-0000-7000-8000-00000000050${n}`,
    plan: { id: '018f0000-0000-7000-8000-000000000600', name: `Plano ${n}`, period: 'monthly' },
    startsAt: dueDate,
    endsAt: dueDate.replace(/-\d\d$/, '-28'),
    priceCents: 9990,
    dueDate,
    status,
    payment: null,
    ...overrides,
  };
}

function serve(api: FakeApi, profile: MyProfile = profileOf(), items: StudentPayment[] = []) {
  api.session = sessionOf('student', { name: profile.name, email: profile.email ?? 'ana@example.com' });
  api.on('GET', '/api/me/profile', { status: 200, body: profile });
  api.on('GET', '/api/me/payments', { status: 200, body: { items } });
}

const field = (page: Page, name: string) => page.getByLabel(name, { exact: true });

/** A cor computada de um elemento, com o alfa, resolvida pelo próprio navegador. */
async function colorOf(locator: Locator, property = 'color') {
  return locator.evaluate((element, prop) => {
    const raw = getComputedStyle(element).getPropertyValue(prop);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = raw;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return { raw, r: r!, g: g!, b: b!, a: a! };
  }, property);
}

const RED = { r: 248, g: 113, b: 113 };
const normalize = (text: string | null) => (text ?? '').replaceAll('\u00a0', ' ');

test('minha_conta_header_identity_photo_and_status_badge', async ({ page, api }) => {
  servePhotoFile(api, PHOTO_PATH);
  serve(api, profileOf({ photoUrl: PHOTO_URL }), [periodOf(1, '2026-03-01', 'paid'), periodOf(2, '2026-04-01', 'pending')]);
  await page.setViewportSize(DESKTOP);
  await page.goto('/minha-conta');

  // o cabeçalho do portal: a marca e o botão de sair
  await expect(page.locator('[data-slot="brand"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();

  // o bloco de identidade: a foto 3:4, o nome a 30 px em peso 500 e o badge do período atual
  const identity = page.locator('[data-slot="identity"]');
  const photo = identity.getByRole('img', { name: 'Foto de Ana Souza' });
  await expect(photo).toBeVisible();
  const box = (await photo.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([120, 160]);

  const name = identity.getByRole('heading', { level: 2, name: 'Ana Souza', exact: true });
  await expect(name).toBeVisible();
  expect(await name.evaluate((element) => ({ size: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight }))).toEqual({
    size: '30px',
    weight: '500',
  });
  await expect(identity.locator('[data-slot="status-badge"]')).toHaveText('Pendente');

  // abaixo de 768 px a mesma foto encolhe para 96×128
  await page.setViewportSize(MOBILE);
  await page.goto('/minha-conta');
  const small = (await identity.getByRole('img', { name: 'Foto de Ana Souza' }).boundingBox())!;
  expect([Math.round(small.width), Math.round(small.height)]).toEqual([96, 128]);
});

test('summary_card_shows_due_date_plan_badge_and_scroll_link', async ({ page, api }) => {
  serve(api, profileOf(), [periodOf(1, '2026-03-01', 'paid'), periodOf(2, '2026-04-01', 'pending')]);
  await page.goto('/minha-conta');

  const summary = page.locator('[data-slot="summary"]');
  await expect(summary.locator('[data-slot="summary-due"]')).toHaveText('01/04/2026');
  await expect(summary.getByText('Plano 2', { exact: true })).toBeVisible();
  await expect(summary.locator('[data-slot="status-badge"]')).toHaveText('Pendente');

  const link = summary.getByRole('link', { name: 'Ver pagamentos', exact: true });
  await expect(link).toHaveAttribute('href', '#historico');
  await link.click();
  await expect(page).toHaveURL(/#historico$/);
  await expect(page.locator('#historico')).toBeInViewport();
});

test('overdue_summary_uses_status_bad', async ({ page, api }) => {
  serve(api, profileOf(), [periodOf(1, '2026-02-01', 'overdue')]);
  await page.goto('/minha-conta');

  const summary = page.locator('[data-slot="summary"]');
  const due = summary.locator('[data-slot="summary-due"]');
  await expect(due).toHaveText('01/02/2026');
  expect(await colorOf(due)).toMatchObject(RED);

  const badge = summary.locator('[data-slot="status-badge"]');
  await expect(badge).toHaveText('Atrasado');
  expect(await colorOf(badge)).toMatchObject(RED);
  // a superfície do badge é a de `--status-bad-surface` (14% do vermelho sobre o cartão)
  const surface = await colorOf(badge, 'background-color');
  expect(surface).toMatchObject({ ...RED, a: 36 });
});

test('without_enrollment_shows_empty_state_and_no_summary', async ({ page, api }) => {
  serve(api);
  await page.goto('/minha-conta');

  const empty = page.locator('[data-slot="empty-state"]');
  await expect(empty).toBeVisible();
  await expect(empty.locator('[data-slot="empty-state-title"]')).toHaveText('Você ainda não tem matrícula registrada.');
  await expect(page.locator('[data-slot="summary"]')).toHaveCount(0);
});

test('history_has_value_column_tabular_money_and_payment_date', async ({ page, api }) => {
  const paid = periodOf(1, '2026-03-01', 'paid', {
    priceCents: 123456,
    payment: { id: '018f0000-0000-7000-8000-000000000c01', createdAt: '2026-03-05T12:00:00.000Z' },
  });
  serve(api, profileOf(), [paid, periodOf(2, '2026-04-01', 'pending')]);
  await page.goto('/minha-conta');

  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Plano', 'Período', 'Vencimento', 'Valor', 'Situação']);

  // do vencimento mais novo para o mais antigo: o de abril primeiro, o pago de março depois
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  const paidRow = rows.nth(1);
  const value = paidRow.getByRole('cell').nth(3);
  expect(normalize(await value.textContent())).toBe('R$ 1.234,56');
  expect(await value.evaluate((element) => ({ align: getComputedStyle(element).textAlign, numeric: getComputedStyle(element).fontVariantNumeric }))).toEqual({
    align: 'right',
    numeric: 'tabular-nums',
  });

  const situation = paidRow.getByRole('cell').nth(4);
  await expect(situation.locator('[data-slot="status-badge"]')).toHaveText('Pago');
  // o período pago mostra a data do pagamento na segunda linha
  await expect(situation.locator('[data-slot="payment-date"]')).toHaveText('05/03/2026');
  await expect(rows.nth(0).locator('[data-slot="payment-date"]')).toHaveCount(0);
});

test('portal_history_and_form_switch_at_768', async ({ page, api }) => {
  const periods = [periodOf(1, '2026-03-01', 'paid'), periodOf(2, '2026-04-01', 'pending')];
  serve(api, profileOf(), periods);

  const columnCount = () =>
    page
      .locator('main form input')
      .evaluateAll((inputs) => new Set(inputs.map((input) => Math.round(input.getBoundingClientRect().left))).size);

  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto('/minha-conta');
  const cards = page.locator('[data-slot="panel-rows"]');
  await expect(cards).toBeVisible();
  await expect(page.getByRole('table')).toBeHidden();
  expect(await columnCount()).toBe(1);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBe(clientWidth);

  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/minha-conta');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(cards).toBeHidden();
  expect(await columnCount()).toBe(2);
});

test('photo_frame_pending_message_and_crop_are_three_by_four', async ({ page, api }) => {
  // com a foto pendente: a moldura 3:4, a mensagem e nenhuma ação de envio
  servePhotoFile(api, PENDING_PHOTO_PATH);
  const pendingPhoto = {
    id: '018f0000-0000-7000-8000-000000000998',
    version: 2,
    createdAt: '2026-10-30T12:00:00.000Z',
    url: `${PENDING_PHOTO_PATH}?exp=2000000000&sig=assinatura`,
  };
  serve(api, profileOf({ pendingPhoto }));
  await page.goto('/minha-conta');

  const photoSection = page.locator('[data-slot="photo"]');
  await expect(photoSection.getByText('Aguardando aprovação da recepção.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar foto', exact: true })).toHaveCount(0);
  const pending = (await photoSection.getByRole('img', { name: 'Foto aguardando aprovação' }).boundingBox())!;
  expect(pending.width / pending.height).toBeCloseTo(0.75, 2);

  // sem pendente: a ação de envio abre o recorte 3:4
  servePhotoFile(api, PHOTO_PATH);
  serve(api, profileOf({ photoUrl: PHOTO_URL }));
  await page.goto('/minha-conta');
  await expect(photoSection.getByText('Aguardando aprovação da recepção.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enviar foto', exact: true })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(pngFile(600, 800));

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const crop = (await page.locator('[data-slot="crop-frame"]').boundingBox())!;
  expect(crop.width / crop.height).toBeCloseTo(0.75, 2);
});

test('load_failure_keeps_header_identity_and_one_alert', async ({ page, api }) => {
  serve(api);
  api.on('GET', '/api/me/profile', problem(500, 'internal_error'));
  await page.goto('/minha-conta');

  await expect(page.locator('[data-slot="brand"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="identity"]')).toBeVisible();
  await expect(page.getByRole('main').locator('[role="alert"]')).toHaveCount(1);
  await expect(page.getByText(LOAD_ERROR, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();

  // a falha dos pagamentos tem o mesmo desfecho
  serve(api);
  api.on('GET', '/api/me/payments', problem(503, 'service_unavailable'));
  await page.goto('/minha-conta');
  await expect(page.getByRole('main').locator('[role="alert"]')).toHaveCount(1);
  await expect(page.getByText(LOAD_ERROR, { exact: true })).toBeVisible();

  // e o botão recarrega os dois
  serve(api);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(field(page, 'Telefone')).toHaveValue('(11) 91234-5678');
  await expect(page.getByRole('main').locator('[role="alert"]')).toHaveCount(0);
});

test('portal_cards_reveal_and_buttons_press_and_rest_when_reduced', async ({ page, api }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(DESKTOP);
  serve(api, profileOf(), [periodOf(1, '2026-04-01', 'pending')]);
  const cards = ['[data-slot="summary"]', '[data-slot="dados"]', '[data-slot="pagamentos"]'];

  // da landing com sessão de aluno, o CTA leva ao portal por navegação do cliente: é quando o
  // `Reveal` monta no navegador e os cartões entram em cascata
  await page.goto('/');
  await settle(page);
  await startSampling(page, cards, { appear: true, ms: 800 });
  await page.getByRole('link', { name: 'Ir para o painel', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL('/minha-conta');
  const frames = await framesOf(page);

  const starts = cards.map((_, index) => frames.find((frame) => frame.targets[index] && Number(frame.targets[index]!.opacity) >= 0.99)?.t);
  expect(starts.every((time) => time !== undefined)).toBe(true);
  for (let index = 1; index < starts.length; index += 1) {
    expect(Math.abs(starts[index]! - starts[index - 1]! - 40), `cartão ${index}`).toBeLessThanOrEqual(17);
  }
  for (const target of frames.at(-1)!.targets) expect(target).toMatchObject({ opacity: '1', transform: 'none' });

  // o botão é `pressable`: pressionado, encolhe a 0.98
  const button = page.getByRole('button', { name: 'Salvar', exact: true });
  await button.hover();
  await page.mouse.down();
  await page.waitForTimeout(220);
  const pressed = await button.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.up();
  expect(pressed).toMatch(/^matrix\(0\.98/);

  // com movimento reduzido, nada se move
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await settle(page);
  await startSampling(page, cards, { appear: true, ms: 600 });
  await page.getByRole('link', { name: 'Ir para o painel', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL('/minha-conta');
  const still = await framesOf(page);
  expect(still.length).toBeGreaterThan(0);
  for (const frame of still) {
    for (const target of frame.targets) if (target) expect(target).toMatchObject({ opacity: '1', transform: 'none' });
  }
});

test('student_session_has_no_team_link', async ({ page, api }) => {
  serve(api, profileOf(), [periodOf(1, '2026-04-01', 'pending')]);
  await page.goto('/minha-conta');

  const hrefs = await page.getByRole('main').getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    for (const route of TEAM_ROUTES) expect(href === route || href.startsWith(`${route}/`), href).toBe(false);
  }
  // a sessão de aluno não tem shell nem aba de equipe: só o portal
  await expect(page.locator('header')).toHaveCount(0);
  await expect(page.locator('[data-slot="side-nav"]')).toHaveCount(0);
});

test('contact_form_saves_and_shows_field_errors', async ({ page, api }) => {
  serve(api);
  await page.goto('/minha-conta');
  await expect(field(page, 'Telefone')).toBeVisible();

  // e-mail e CPF são texto, e só os quatro campos têm `input`
  await expect(page.getByText('ana@example.com', { exact: true })).toBeVisible();
  await expect(page.getByText('529.982.247-25', { exact: true })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toHaveCount(0);
  await expect(page.getByLabel('CPF')).toHaveCount(0);
  const labels = await page.locator('main form input').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).labels?.[0]?.textContent),
  );
  expect(labels).toEqual(['Telefone', 'Endereço', 'Contato de emergência (nome)', 'Contato de emergência (telefone)']);

  api.on('PATCH', '/api/me/profile', {
    status: 200,
    body: profileOf({ address: 'Av. Central, 100' }),
  });
  await field(page, 'Endereço').fill('Av. Central, 100');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(page.getByText('Dados atualizados.', { exact: true })).toBeVisible();
  await expect(field(page, 'Endereço')).toHaveValue('Av. Central, 100');
  const sent = api.requests.filter((request) => request.method === 'PATCH' && request.path === '/api/me/profile');
  expect(sent.map((request) => request.body)).toEqual([{ address: 'Av. Central, 100' }]);

  api.on(
    'PATCH',
    '/api/me/profile',
    problem(422, 'validation_failed', [
      { path: 'phone', message: 'Telefone recusado pela API.' },
      { path: 'address', message: 'Endereço recusado pela API.' },
    ]),
  );
  await field(page, 'Telefone').fill('123');
  await field(page, 'Endereço').fill('x');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(field(page, 'Telefone')).toHaveAccessibleDescription('Telefone recusado pela API.');
  await expect(field(page, 'Endereço')).toHaveAccessibleDescription('Endereço recusado pela API.');
});
