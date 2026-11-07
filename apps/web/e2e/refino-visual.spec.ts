import type { MyProfile, StudentPayment } from '@academia/contracts';
import type { Locator, Page } from '@playwright/test';
import { checkInsPath, LATE, listItemOf, servePhotos, serveSearch, statusOf, statusPath } from './support/check-ins.ts';
import { expect, type FakeApi, problem, servePhotoFile, sessionOf, test } from './support/fake-api.ts';
import { PLAN_ID, serveWorld, styleOf } from './support/identidade.ts';
import { leadOf, serveLeads } from './support/leads.ts';
import { periodOf } from './support/payments.ts';
import { PHOTO_PATH, PHOTO_URL } from './support/photo.ts';
import { planOf, STUDENT_ID, studentOf } from './support/plans.ts';
import { STAFF_ID } from './support/staff.ts';

/** As provas das peças e das telas de entrada do refino visual (S1 e a entrada da S3). */

const FIRST_ACCESS_SENT =
  'Se o CPF e o e-mail forem de um aluno com cadastro, enviamos um link para o e-mail da ficha. Ele vale por 24 horas. Se você já tem senha, use Esqueci minha senha.';
const FORGOT_SENT = 'Se o e-mail for de um aluno com acesso, enviamos um link. Ele vale por 1 hora.';

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

function servePortal(api: FakeApi, items: StudentPayment[], profile: MyProfile = profileOf()) {
  api.session = sessionOf('student', { name: profile.name, email: profile.email ?? 'ana@example.com' });
  api.on('GET', '/api/me/profile', { status: 200, body: profile });
  api.on('GET', '/api/me/payments', { status: 200, body: { items } });
}

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

/** A luminância relativa de um canal sRGB. */
const linear = (value: number) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};
const luminance = (color: { r: number; g: number; b: number }) => 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
const contrast = (one: { r: number; g: number; b: number }, other: { r: number; g: number; b: number }) => {
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
};

/**
 * A comparação de uma cor com alfa: o raster do canvas desfaz a pré-multiplicação do alfa e os
 * canais voltam com uma diferença de arredondamento de até ~1/alfa.
 */
function near(actual: { r: number; g: number; b: number; a: number }, expected: { r: number; g: number; b: number; a?: number }, label: string) {
  expect(Math.abs(actual.r - expected.r), `${label} r`).toBeLessThanOrEqual(5);
  expect(Math.abs(actual.g - expected.g), `${label} g`).toBeLessThanOrEqual(5);
  expect(Math.abs(actual.b - expected.b), `${label} b`).toBeLessThanOrEqual(5);
  if (expected.a !== undefined) expect(Math.abs(actual.a - expected.a), `${label} a`).toBeLessThanOrEqual(1);
}

const STATUS_TONES = [
  { status: 'paid' as const, text: { r: 252, g: 244, b: 60 }, surface: { r: 252, g: 244, b: 60, a: 36 }, label: 'Pago' },
  { status: 'pending' as const, text: { r: 245, g: 158, b: 11 }, surface: { r: 245, g: 158, b: 11, a: 36 }, label: 'Pendente' },
  { status: 'overdue' as const, text: { r: 248, g: 113, b: 113 }, surface: { r: 248, g: 113, b: 113, a: 36 }, label: 'Atrasado' },
  { status: 'cancelled' as const, text: { r: 163, g: 163, b: 163 }, surface: { r: 26, g: 26, b: 26, a: 255 }, label: 'Matrícula cancelada' },
];

// C4 - a situação pinta o texto e a superfície dos tokens de `--status-*`
test('status_badge_uses_status_tokens_on_their_surfaces', async ({ page, api }) => {
  servePortal(
    api,
    STATUS_TONES.map((tone, index) => periodOf({ startsAt: `2026-0${index + 1}-01`, status: tone.status })),
  );
  await page.goto('/minha-conta');

  const badges = page.getByRole('table').locator('[data-slot="status-badge"]');
  await expect(badges).toHaveCount(STATUS_TONES.length);
  // a linha mais nova primeiro: a ordem dos períodos é a inversa da inserida
  for (const [index, tone] of [...STATUS_TONES].reverse().entries()) {
    const badge = badges.nth(index);
    await expect(badge).toHaveText(tone.label);
    expect(await colorOf(badge), tone.label).toMatchObject(tone.text);
    near(await colorOf(badge, 'background-color'), tone.surface, tone.label);
  }
});

// C6 - a geometria do `ScreenHeader` em 390 e em 1440
test('screen_header_geometry_at_390_and_1440', async ({ page, api }) => {
  servePortal(api, [periodOf({ status: 'pending' })]);

  for (const [width, gutter] of [
    [1440, 32],
    [390, 16],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/minha-conta');

    const header = page.locator('[data-slot="screen-header"]');
    await expect(header).toBeVisible();
    const identity = page.locator('[data-slot="identity"]');
    await expect(identity).toHaveCount(1);

    // as bordas do cabeçalho caem no gutter do `main`
    const main = page.getByRole('main');
    const mainBox = (await main.boundingBox())!;
    const mainPadding = await main.evaluate((element) => ({
      left: parseFloat(getComputedStyle(element).paddingLeft),
      right: parseFloat(getComputedStyle(element).paddingRight),
    }));
    expect(mainPadding).toEqual({ left: gutter, right: gutter });
    const box = (await header.boundingBox())!;
    expect(Math.round(box.x)).toBe(Math.round(mainBox.x + mainPadding.left));
    expect(Math.round(box.x + box.width)).toBe(Math.round(mainBox.x + mainBox.width - mainPadding.right));

    // o olho: 14 px no texto secundário, com o ponto de 8 px do acento
    const eyebrow = header.locator('[data-slot="screen-header-eyebrow"]');
    const eyebrowStyle = await eyebrow.evaluate((element) => ({
      size: getComputedStyle(element).fontSize,
      color: getComputedStyle(element).color,
    }));
    expect(eyebrowStyle).toEqual({ size: '14px', color: 'rgb(163, 163, 163)' });
    const dot = eyebrow.locator('[data-slot="eyebrow-dot"]');
    expect((await dot.boundingBox())!.width).toBe(8);
    expect(await colorOf(dot, 'background-color')).toMatchObject({ r: 252, g: 244, b: 60 });

    // o título é o `h2` de 30 px em peso 500, e a meta de 14 px no texto secundário
    const title = header.getByRole('heading', { level: 2 });
    await expect(title).toHaveText('Ana Souza');
    expect(await title.evaluate((element) => ({ size: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight }))).toEqual({
      size: '30px',
      weight: '500',
    });
    const meta = header.locator('[data-slot="screen-header-meta"]');
    expect(await meta.evaluate((element) => ({ size: getComputedStyle(element).fontSize, color: getComputedStyle(element).color }))).toEqual({
      size: '14px',
      color: 'rgb(163, 163, 163)',
    });

    // as ações ficam à direita; a 390 px empilham sob o título
    const actions = header.locator('[data-slot="screen-header-actions"]');
    const actionsBox = (await actions.boundingBox())!;
    if (width === 1440) {
      expect(Math.round(actionsBox.x + actionsBox.width)).toBe(Math.round(box.x + box.width));
    } else {
      const titleBox = (await title.boundingBox())!;
      expect(actionsBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
    }
  }
});

// C7 - o `EmptyState` do portal do aluno
test('empty_state_has_icon_title_description_and_slot', async ({ page, api }) => {
  servePortal(api, []);
  await page.goto('/minha-conta');

  const empty = page.locator('[data-slot="empty-state"]');
  await expect(empty).toBeVisible();
  // não é um `Alert`: o alerta é o aviso de falha
  await expect(empty.locator('[role="alert"]')).toHaveCount(0);

  const icon = empty.locator('svg');
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute('aria-hidden', 'true');
  const iconBox = (await icon.boundingBox())!;
  expect([Math.round(iconBox.width), Math.round(iconBox.height)]).toEqual([24, 24]);

  const title = empty.locator('[data-slot="empty-state-title"]');
  await expect(title).toHaveText('Você ainda não tem matrícula registrada.');
  expect(await title.evaluate((element) => ({ size: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight }))).toEqual({
    size: '16px',
    weight: '500',
  });

  const description = empty.locator('[data-slot="empty-state-description"]');
  expect(await description.evaluate((element) => ({ size: getComputedStyle(element).fontSize, color: getComputedStyle(element).color }))).toEqual({
    size: '14px',
    color: 'rgb(163, 163, 163)',
  });
});

// C8 - a `ListOrTable` troca no ponto de 768 px com os mesmos valores
test('list_or_table_switches_at_768_with_the_same_values', async ({ page, api }) => {
  servePortal(api, [periodOf({ startsAt: '2026-02-01', status: 'paid' }), periodOf({ startsAt: '2026-03-01', status: 'pending' }), periodOf({ startsAt: '2026-04-01', status: 'overdue' })]);
  const cards = page.locator('[data-slot="panel-rows"]');

  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto('/minha-conta');
  await expect(cards).toBeVisible();
  await expect(page.getByRole('table')).toBeHidden();
  const cardStyles = await cards.locator('li').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { radius: style.borderRadius, background: style.backgroundColor, padding: style.padding };
  });
  expect(cardStyles).toEqual({ radius: '16px', background: 'rgb(26, 26, 26)', padding: '12px' });
  const cardValues = await cards.locator('li').evaluateAll((items) => items.map((item) => (item.textContent ?? '').trim()));

  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/minha-conta');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(cards).toBeHidden();
  const tableValues = await page
    .getByRole('table')
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((row) => (row.textContent ?? '').trim()));

  expect(tableValues).toEqual(cardValues);
});

// C9 - o cabeçalho da `Table`, o hover da linha e a célula numérica
test('table_header_hover_and_numeric_cell', async ({ page, api }) => {
  servePortal(api, [periodOf({ priceCents: 123456, status: 'pending' })]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/minha-conta');

  const table = page.getByRole('table');
  const head = table.getByRole('columnheader').first();
  expect(await head.evaluate((element) => ({ size: getComputedStyle(element).fontSize, transform: getComputedStyle(element).textTransform }))).toEqual({
    size: '12px',
    transform: 'uppercase',
  });
  expect(await colorOf(head)).toMatchObject({ r: 212, g: 212, b: 212 });
  expect(await colorOf(head, 'background-color')).toMatchObject({ r: 26, g: 26, b: 26 });

  // o hover da linha muda o fundo para `--muted` a 50%
  const row = table.locator('tbody tr').first();
  await row.hover();
  await page.waitForTimeout(250);
  near(await colorOf(row, 'background-color'), { r: 26, g: 26, b: 26, a: 128 }, 'linha');

  // a célula numérica fica à direita e tabular
  const numeric = row.getByRole('cell').nth(3);
  expect(await numeric.evaluate((element) => ({ align: getComputedStyle(element).textAlign, numeric: getComputedStyle(element).fontVariantNumeric }))).toEqual({
    align: 'right',
    numeric: 'tabular-nums',
  });
});

// C10 - o envio do formulário usa `Button busy`
test('form_submit_uses_busy_button', async ({ page, api }) => {
  servePortal(api, []);
  api.on('PATCH', '/api/me/profile', 'hang');
  await page.goto('/minha-conta');

  const button = page.getByRole('button', { name: 'Salvar', exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toBeDisabled();
  const spinner = button.locator('[data-slot="spinner"]');
  await expect(spinner).toBeVisible();
  // o giro tira a caixa de medição do 16 px: o tamanho do indicador é o do CSS
  expect(await spinner.evaluate((element) => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height }))).toEqual({
    width: '16px',
    height: '16px',
  });
});

// C11 - a borda de controle dos campos e do botão outline
test('control_borders_are_border_control_and_reach_three_to_one', async ({ page, api }) => {
  const card = { r: 15, g: 15, b: 15 };
  const check = async (locator: Locator, label: string) => {
    const border = await colorOf(locator, 'border-top-color');
    expect(border, label).toMatchObject({ r: 107, g: 107, b: 107 });
    expect(contrast(border, card), label).toBeGreaterThanOrEqual(3);
  };

  // o `Input` e o `Button` outline do portal
  servePortal(api, []);
  await page.goto('/minha-conta');
  await check(page.getByLabel('Telefone', { exact: true }), 'Input');
  await check(page.getByRole('button', { name: 'Sair', exact: true }), 'Button outline');

  // o `Input` do login
  api.session = undefined;
  await page.goto('/login');
  await check(page.getByLabel('E-mail'), 'Input do login');

  // o `Select` de uma tela da equipe
  serveWorld(api, 'admin');
  await page.goto('/audit');
  await check(page.getByLabel('Usuário', { exact: true }), 'Select');
});

// C34 - o desfecho do primeiro acesso e da senha é um cartão
test('auth_success_states_are_cards_with_icon_title_line_and_back_link', async ({ page, api }) => {
  const check = async (message: string) => {
    const card = page.locator('[data-slot="auth-success"]');
    await expect(card).toBeVisible();
    const icon = card.locator('svg');
    await expect(icon).toHaveCount(1);
    const box = (await icon.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([24, 24]);
    await expect(card.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(card.getByText(message, { exact: true })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Voltar ao login', exact: true })).toHaveAttribute('href', '/login');
    // o formulário não fica na tela
    await expect(page.locator('main form')).toHaveCount(0);
  };

  api.on('POST', '/api/portal/first-access', { status: 202 });
  await page.goto('/primeiro-acesso');
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.getByRole('button', { name: 'Pedir acesso', exact: true }).click();
  await check(FIRST_ACCESS_SENT);

  api.on('POST', '/api/password-reset', { status: 202 });
  await page.goto('/esqueci-senha');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.getByRole('button', { name: 'Enviar link', exact: true }).click();
  await check(FORGOT_SENT);
});

// C35 - a moldura, a marca, o olho e a escala de título das telas de entrada
test('auth_screens_keep_frame_brand_eyebrow_and_title_scale', async ({ page }) => {
  const screens = [
    { path: '/login', eyebrow: 'Acesso ao sistema' },
    { path: '/primeiro-acesso', eyebrow: 'Portal do aluno' },
    { path: '/esqueci-senha', eyebrow: 'Portal do aluno' },
    { path: '/definir-senha?token=t1', eyebrow: 'Portal do aluno' },
  ];
  await page.setViewportSize({ width: 1440, height: 900 });
  const widths: number[] = [];

  for (const screen of screens) {
    await page.goto(screen.path);
    await expect(page.locator('[data-slot="auth-photo"]'), screen.path).toHaveCount(1);
    await expect(page.locator('[data-slot="brand"]'), screen.path).toBeVisible();

    const eyebrow = page.getByText(screen.eyebrow, { exact: true });
    await expect(eyebrow, screen.path).toBeVisible();
    expect(await eyebrow.evaluate((element) => getComputedStyle(element).fontSize), screen.path).toBe('14px');

    const title = page.getByRole('heading', { level: 1 });
    expect(await title.evaluate((element) => getComputedStyle(element).fontSize), screen.path).toBe('36px');

    widths.push((await page.getByRole('main').boundingBox())!.width);
  }

  expect(new Set(widths.map((width) => Math.round(width))).size).toBe(1);
});

// C44 - o esqueleto do portal carrega com a geometria da tela e sem a shell da equipe
test('portal_loading_matches_the_loaded_geometry_without_the_team_shell', async ({ page, api }) => {
  for (const [width, gutter] of [
    [390, 16],
    [1440, 32],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    // a API não responde: a tela fica no `loading.tsx` até o tempo limite do servidor
    api.session = sessionOf('student', { name: 'Ana Souza', email: 'ana@example.com' });
    api.on('GET', '/api/me/profile', 'hang');
    api.on('GET', '/api/me/payments', 'hang');
    await page.goto('/minha-conta', { waitUntil: 'commit' });

    const skeleton = page.locator('[data-slot="page-skeleton"]');
    await expect(skeleton).toBeVisible();
    // sem barra lateral, barra inferior, avatar ou abas da shell da equipe
    for (const slot of ['skeleton-side', 'skeleton-bottom-bar', 'skeleton-avatar', 'side-nav', 'bottom-nav']) {
      await expect(page.locator(`[data-slot="${slot}"]`), slot).toHaveCount(0);
    }

    const skeletonMain = skeleton.locator('main');
    const padding = await skeletonMain.evaluate((element) => ({
      left: parseFloat(getComputedStyle(element).paddingLeft),
      right: parseFloat(getComputedStyle(element).paddingRight),
    }));
    expect(padding).toEqual({ left: gutter, right: gutter });
    const cardBoxes = await page.locator('[data-slot="skeleton-card"]').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().width));
    expect(cardBoxes).toHaveLength(3);
    expect(new Set(cardBoxes.map((value) => Math.round(value))).size).toBe(1);

    // a tela carregada tem a mesma largura de conteúdo e os mesmos gutters
    servePortal(api, [periodOf({ status: 'pending' })]);
    await page.goto('/minha-conta');
    const main = page.getByRole('main');
    const loadedPadding = await main.evaluate((element) => ({
      left: parseFloat(getComputedStyle(element).paddingLeft),
      right: parseFloat(getComputedStyle(element).paddingRight),
    }));
    expect(loadedPadding).toEqual(padding);
    const sectionWidths = await main.locator('section').evaluateAll((sections) => sections.map((section) => section.getBoundingClientRect().width));
    expect(sectionWidths.length).toBeGreaterThan(0);
    for (const sectionWidth of sectionWidths) expect(Math.round(sectionWidth)).toBe(Math.round(cardBoxes[0]!));
  }

  // a foto do esqueleto também é 3:4, como a da tela carregada
  servePhotoFile(api, PHOTO_PATH);
  servePortal(api, [], profileOf({ photoUrl: PHOTO_URL }));
  await page.goto('/minha-conta');
  const photo = (await page.locator('[data-slot="photo"] img').boundingBox())!;
  expect(photo.width / photo.height).toBeCloseTo(0.75, 2);
});

/* --------------------------------------------------------------------------------------------------- */
/* S4 - as telas da equipe (C47 a C64)                                                                 */
/* --------------------------------------------------------------------------------------------------- */

const SHELL_HEADER = '[data-slot="screen-header"]';

/** As 20 telas com `Shell` e `ScreenHeader` (as duas de impressão ficam de fora, AC 62). */
const THE_TWENTY = [
  '/dashboard',
  '/students',
  '/students/new',
  `/students/${STUDENT_ID}`,
  `/students/${STUDENT_ID}/edit`,
  '/staff',
  '/staff/new',
  `/staff/${STAFF_ID}`,
  `/staff/${STAFF_ID}/edit`,
  '/plans',
  '/plans/new',
  `/plans/${PLAN_ID}/edit`,
  '/payments',
  '/check-ins',
  '/check-in',
  '/audit',
  '/leads',
  '/users',
  '/privacy',
  '/account',
] as const;

/** As 22 rotas com `Shell` (as 20 telas e as duas versões para impressão). */
const SHELL_ROUTES = [...THE_TWENTY, `/students/${STUDENT_ID}/print`, `/staff/${STAFF_ID}/print`] as const;

/** Uma linha da trilha, como a API a devolve, para a tabela de `/audit` ter registros. */
const auditLogOf = () => ({
  id: '018f0000-0000-7000-8000-000000000e01',
  createdAt: '2026-10-07T15:00:00.000Z',
  user: { id: '018f0000-0000-7000-8000-000000000001', name: 'Marina Duarte' },
  action: 'login',
  entity: 'user',
  entityId: '018f0000-0000-7000-8000-000000000001',
  ip: '198.51.100.1',
  userAgent: 'Chromium',
  diff: null,
});

/** O valor de uma propriedade CSS de um elemento. */
const cssOf = (locator: Locator, properties: string[]) =>
  locator.evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  }, properties);

const mainOf = (page: Page) => page.getByRole('main');
const badgesOf = (page: Page) => mainOf(page).locator('[data-slot="status-badge"]');

// C47 - um `ScreenHeader` por tela da equipe, título h2 de 30 px e peso 500, nenhum outro texto a 30 px
test('every_shell_screen_has_one_screen_header_at_30px', async ({ page, api }) => {
  test.setTimeout(300_000);
  serveWorld(api, 'admin');
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(THE_TWENTY).toHaveLength(20);

  for (const path of THE_TWENTY) {
    await page.goto(path);
    const main = mainOf(page);
    await expect(main, path).toBeVisible();

    // exatamente um `ScreenHeader`, e ele vive na largura do `main`
    await expect(main.locator(SHELL_HEADER), path).toHaveCount(1);
    const title = main.locator('[data-slot="screen-header-title"]');
    await expect(title, path).toHaveCount(1);
    expect(await cssOf(title, ['font-size', 'font-weight']), path).toEqual({ 'font-size': '30px', 'font-weight': '500' });

    // nenhum outro texto da tela usa 30 px
    const offenders = await main.evaluate((root) =>
      [...root.querySelectorAll('*')]
        .filter((element) => getComputedStyle(element).fontSize === '30px')
        .filter((element) => element.closest('[data-slot="screen-header-title"]') === null)
        .map((element) => `${element.tagName.toLowerCase()}:${(element.textContent ?? '').trim().slice(0, 30)}`),
    );
    expect(offenders, path).toEqual([]);

    // o gutter do `main` fica em 32 px a partir de 1024 px
    const padding = await cssOf(main, ['padding-left', 'padding-right']);
    expect(padding, path).toEqual({ 'padding-left': '32px', 'padding-right': '32px' });
  }

  // abaixo de 1024 px o gutter é de 16 px
  await page.setViewportSize({ width: 1023, height: 900 });
  await page.goto('/students');
  expect(await cssOf(mainOf(page), ['padding-left', 'padding-right'])).toEqual({
    'padding-left': '16px',
    'padding-right': '16px',
  });
});

// C48 - a saudação no `ScreenHeader`, a grade 1/2/3 e o número de "Alunos" a 48 px em peso 600
test('dashboard_header_greeting_grid_and_student_number', async ({ page, api }) => {
  test.setTimeout(180_000);
  serveWorld(api, 'admin');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  const main = mainOf(page);

  // a saudação é do `ScreenHeader`, que é o primeiro bloco do `main`: nada a precede
  const header = main.locator(SHELL_HEADER);
  await expect(header).toHaveCount(1);
  await expect(header).toContainText('Olá, Marina Duarte.');
  expect(await main.evaluate((root) => root.firstElementChild?.getAttribute('data-slot'))).toBe('screen-header');
  await expect(header.getByRole('heading', { name: 'Painel', exact: true })).toBeVisible();

  // o "Alunos" fica em 48 px e peso 600
  const number = main.locator('section[aria-labelledby="card-students"] dd').first();
  expect(await cssOf(number, ['font-size', 'font-weight'])).toEqual({ 'font-size': '48px', 'font-weight': '600' });

  // a grade: 1 coluna abaixo de 768, 2 de 768 a 1023 e 3 a partir de 1024
  const columnsAt = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dashboard');
    return mainOf(page)
      .locator('[data-slot="dashboard-grid"]')
      .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
  };
  expect(await columnsAt(767)).toBe(1);
  expect(await columnsAt(768)).toBe(2);
  expect(await columnsAt(1023)).toBe(2);
  expect(await columnsAt(1024)).toBe(3);
});

// C49 - o vazio do registro e o vazio da busca têm títulos diferentes
test('empty_states_use_record_and_search_titles', async ({ page, api }) => {
  serveWorld(api, 'admin');
  api.on('GET', '/api/students', { status: 200, body: { items: [], nextCursor: null } });
  await page.goto('/students');

  const empty = mainOf(page).locator('[data-slot="empty-state"]');
  await expect(empty).toHaveCount(1);
  await expect(empty.locator('[data-slot="empty-state-title"]')).toHaveText('Nenhum aluno cadastrado.');
  await expect(mainOf(page).getByRole('table')).toHaveCount(0);

  // a busca sem resultado usa o título da busca
  api.on('GET', '/api/students', (request) =>
    request.query === ''
      ? { status: 200, body: { items: [listItemOf(1)], nextCursor: null } }
      : { status: 200, body: { items: [], nextCursor: null } },
  );
  await page.goto('/students');
  await page.getByLabel('Buscar por nome, CPF ou telefone').fill('ninguém');
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
  await expect(mainOf(page).locator('[data-slot="empty-state-title"]')).toHaveText('Nenhum aluno encontrado.');

  // e o vazio do outro registro tem o título dele
  api.on('GET', '/api/staff', { status: 200, body: { items: [] } });
  await page.goto('/staff');
  await expect(mainOf(page).locator('[data-slot="empty-state-title"]')).toHaveText('Nenhum funcionário cadastrado.');
});

// C50 - o `PAGE_BODY` é um corpo simples: a `Table` não fica dentro de um segundo cartão
test('list_tables_sit_in_a_plain_body_without_a_second_card', async ({ page, api }) => {
  serveWorld(api, 'admin');
  api.on('GET', '/api/audit-logs', { status: 200, body: { items: [auditLogOf()], nextCursor: null } });

  for (const path of ['/students', '/staff', '/plans', '/payments', '/check-ins', '/audit'] as const) {
    await page.goto(path);
    const body = mainOf(page).locator('[data-slot="page-body"]');
    await expect(body, path).toHaveCount(1);
    expect(
      await body.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          display: style.display,
          gap: style.rowGap,
          borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
          radius: style.borderTopLeftRadius,
        };
      }),
      path,
    ).toEqual({ display: 'grid', gap: '24px', borders: ['0px', '0px', '0px', '0px'], radius: '0px' });

    // só o cartão da própria `Table` tem borda: nenhum segundo cartão entre ela e o corpo
    const withBorder = await mainOf(page)
      .locator('table')
      .first()
      .evaluate((table) => {
        const borders: string[] = [];
        let element = table.parentElement;
        while (element && element.getAttribute('data-slot') !== 'page-body') {
          if (Number.parseFloat(getComputedStyle(element).borderTopWidth) > 0) borders.push(element.tagName.toLowerCase());
          element = element.parentElement;
        }
        return borders;
      });
    expect(withBorder, path).toEqual(['div']);
  }
});

// C51 - a tabela e os cartões têm os mesmos campos; a situação é um badge; o valor é numérico
test('list_screens_use_table_and_cards_with_the_same_fields', async ({ page, api }) => {
  test.setTimeout(300_000);
  serveWorld(api, 'admin');
  api.on('GET', '/api/audit-logs', { status: 200, body: { items: [auditLogOf()], nextCursor: null } });
  serveLeads(api, [leadOf(), leadOf()]);

  const lists = ['/students', '/staff', '/payments', '/check-ins', '/audit', '/leads'] as const;
  expect(lists).toHaveLength(6);

  for (const path of lists) {
    await page.setViewportSize({ width: 767, height: 900 });
    await page.goto(path);
    const cards = mainOf(page).locator('[data-slot="panel-rows"]');
    await expect(cards, path).toBeVisible();
    await expect(mainOf(page).locator('table'), path).toBeHidden();
    const cardValues = await cards.locator('li').evaluateAll((items) =>
      items.map((item) => [...item.children].map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())),
    );
    expect(cardValues.length, path).toBeGreaterThan(0);

    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(path);
    await expect(mainOf(page).locator('table'), path).toBeVisible();
    await expect(cards, path).toBeHidden();
    const tableValues = await mainOf(page)
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())));
    // os mesmos campos, na mesma ordem, nas duas apresentações
    expect(tableValues, path).toEqual(cardValues);

    // as telas com coluna de situação têm um badge por linha, na tabela e no cartão
    if (['/students', '/staff', '/payments', '/leads'].includes(path)) {
      await expect(mainOf(page).locator('table [data-slot="status-badge"]'), path).toHaveCount(tableValues.length);
      await expect(cards.locator('[data-slot="status-badge"]'), path).toHaveCount(tableValues.length);
    }
  }

  // os valores são numéricos, à direita e tabulares
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/payments');
  const value = mainOf(page).locator('tbody tr td:nth-child(5)').first();
  expect(await cssOf(value, ['text-align', 'font-variant-numeric'])).toEqual({
    'text-align': 'right',
    'font-variant-numeric': 'tabular-nums',
  });
  await expect(value).toContainText('R$');
});

// C52 - um mesmo padrão de toolbar nas cinco listas com filtro
test('filter_toolbars_share_search_selects_reset_and_count', async ({ page, api }) => {
  serveWorld(api, 'admin');
  const screens: Array<{ path: string; count: string; search?: string; selects: string[]; dates?: string[] }> = [
    { path: '/students', count: '2 resultados', search: 'Buscar por nome, CPF ou telefone', selects: ['Situação'] },
    { path: '/payments', count: '1 resultado', selects: ['Situação'] },
    { path: '/check-ins', count: 'Total no período: 1', selects: [], dates: ['De', 'Até'] },
    { path: '/audit', count: '0 resultados', selects: ['Usuário', 'Ação'] },
    { path: '/leads', count: '0 resultados', selects: ['Situação'] },
  ];
  expect(screens).toHaveLength(5);

  for (const screen of screens) {
    await page.goto(screen.path);
    const toolbar = mainOf(page).locator('[data-slot="toolbar"]');
    await expect(toolbar, screen.path).toHaveCount(1);
    await expect(toolbar.getByRole('button', { name: 'Filtrar', exact: true }), screen.path).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Limpar', exact: true }), screen.path).toBeVisible();
    await expect(toolbar.locator('[data-slot="toolbar-count"]'), screen.path).toHaveText(screen.count);
    if (screen.search) await expect(toolbar.getByLabel(screen.search, { exact: true }), screen.path).toBeVisible();
    for (const label of screen.selects) await expect(toolbar.getByLabel(label, { exact: true }), screen.path).toBeVisible();
    for (const label of screen.dates ?? []) await expect(toolbar.getByLabel(label, { exact: true }), screen.path).toBeVisible();
  }
});

// C53 - toda situação é um `StatusBadge` do mapa da door 7
test('every_situation_is_a_status_badge', async ({ page, api }) => {
  test.setTimeout(180_000);
  serveWorld(api, 'admin');

  const check = async (path: string, expected: Array<{ text: string; tone: string }>) => {
    await page.goto(path);
    // a apresentação visível na largura de teste: a tabela a partir de 768 px, os cartões abaixo
    const badges = badgesOf(page).filter({ visible: true });
    await expect(badges, path).toHaveCount(expected.length);
    for (const [index, item] of expected.entries()) {
      await expect(badges.nth(index), `${path} ${item.text}`).toHaveText(item.text);
      await expect(badges.nth(index), `${path} ${item.text}`).toHaveAttribute('data-tone', item.tone);
    }
  };

  await check('/students', [
    { text: 'Ativo', tone: 'ok' },
    { text: 'Ativo', tone: 'ok' },
  ]);
  await check('/staff', [{ text: 'Ativo', tone: 'ok' }]);
  await check(`/staff/${STAFF_ID}`, [{ text: 'Ativo', tone: 'ok' }]);
  await check('/plans', [{ text: 'Ativo', tone: 'ok' }]);
  await check('/payments', [{ text: 'Pendente', tone: 'warn' }]);
  await check('/users', [
    { text: 'Ativo', tone: 'ok' },
    { text: 'Desativado', tone: 'idle' },
  ]);

  // a ficha do aluno: situação, portal, matrícula e pagamento
  api.on('GET', `/api/students/${STUDENT_ID}`, { status: 200, body: { ...studentOf(), portal: 'active' } });
  await check(`/students/${STUDENT_ID}`, [
    { text: 'Ativo', tone: 'ok' },
    { text: 'Acesso ativo', tone: 'ok' },
    { text: 'Ativa', tone: 'ok' },
    { text: 'Pendente', tone: 'warn' },
  ]);

  // o interessado
  serveLeads(api, [leadOf()]);
  await check('/leads', [{ text: 'Novo', tone: 'warn' }]);

  // o acesso do check-in
  const status = statusOf(listItemOf(1).id);
  const item = listItemOf(1, { id: status.student.id, name: status.student.name });
  serveSearch(api, 'reception', [item]);
  servePhotos(api, [item.photoUrl, status.photoUrl]);
  api.on('GET', statusPath(status.student.id), { status: 200, body: status });
  await page.goto('/check-in');
  const field = page.getByLabel('Nome ou CPF', { exact: true });
  await field.fill('Rafaela');
  await field.press('Enter');
  const access = badgesOf(page);
  await expect(access).toHaveCount(1);
  await expect(access).toHaveText('Liberado');
  await expect(access).toHaveAttribute('data-tone', 'ok');
});

// C54 - a ficha do aluno: identidade acima dos campos, três grupos no mesmo cartão, situação visível
test('student_record_identity_groups_and_visible_status', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/students/${STUDENT_ID}`);
  const identity = mainOf(page).locator('[data-slot="identity"]');
  await expect(identity).toBeVisible();

  // foto, nome e situação, acima dos campos
  await expect(identity.locator('img, [role="img"]').first()).toBeVisible();
  await expect(identity.locator('[data-slot="identity-name"]')).toHaveText('Rafaela Prado Cunha');
  const status = identity.locator('[data-slot="status-badge"]').first();
  await expect(status).toHaveText('Ativo');
  const statusBox = (await status.boundingBox())!;
  const firstGroup = identity.locator('h3').first();
  const firstGroupBox = (await firstGroup.boundingBox())!;
  expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(firstGroupBox.y);

  // os campos em "Identificação", "Contato" e "Emergência", dentro do mesmo cartão
  for (const [title, labels] of [
    ['Identificação', ['CPF', 'Data de nascimento', 'Sexo']],
    ['Contato', ['E-mail', 'Telefone', 'Endereço']],
    ['Emergência', ['Contato de emergência (nome)', 'Contato de emergência (telefone)', 'Observações de saúde']],
  ] as const) {
    const group = identity.locator('section', { has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(group, title).toHaveCount(1);
    for (const label of labels) await expect(group.getByText(label, { exact: true }), `${title} ${label}`).toBeVisible();
  }

  // a situação está visível sem rolagem a 1440×900
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(statusBox.y).toBeGreaterThanOrEqual(0);
  expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(900);
});

// C55 - a seção "Acesso ao sistema" da ficha do funcionário num cartão com a escala de título dos blocos
test('staff_record_access_card_shares_the_title_scale', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto(`/staff/${STAFF_ID}`);
  const access = mainOf(page).getByRole('region', { name: 'Acesso ao sistema', exact: true });
  await expect(access).toBeVisible();
  const accessTitle = access.locator('h3');
  await expect(accessTitle).toHaveText('Acesso ao sistema');

  const privacy = mainOf(page).getByRole('region', { name: 'Privacidade', exact: true });
  const privacyTitle = privacy.locator('h3');
  expect(await cssOf(accessTitle, ['font-size', 'font-weight'])).toEqual(await cssOf(privacyTitle, ['font-size', 'font-weight']));
  // e ela fica num cartão da mesma superfície das outras
  expect(await cssOf(access, ['background-color', 'border-top-left-radius'])).toEqual(
    await cssOf(privacy, ['background-color', 'border-top-left-radius']),
  );
});

// C56 - formulários agrupados, com marca de obrigatório, no máximo 640 px, `busy` e "Cancelar"
test('forms_are_grouped_under_640px_with_required_marks_and_cancel', async ({ page, api }) => {
  test.setTimeout(180_000);
  serveWorld(api, 'admin');

  // o cadastro: grupos por seção, a marca do obrigatório e a largura
  await page.goto('/students/new');
  const form = mainOf(page).locator('form').first();
  expect((await form.boundingBox())!.width).toBeLessThanOrEqual(640);
  const groups = form.locator('fieldset');
  expect(await groups.count()).toBeGreaterThanOrEqual(2);
  for (const title of ['Identificação', 'Contato', 'Emergência']) {
    expect(await groups.filter({ has: page.getByText(title, { exact: true }) }).count(), title).toBeGreaterThanOrEqual(1);
  }
  const marks = form.locator('[data-slot="required-mark"]');
  expect(await marks.count()).toBe(4);
  for (const label of ['Nome completo', 'CPF', 'Data de nascimento', 'Telefone']) {
    await expect(form.getByLabel(label, { exact: true }), label).toHaveAttribute('required', '');
  }

  // o envio usa `Button busy`
  api.on('POST', '/api/students', 'hang');
  await form.getByLabel('Nome completo').fill('Aluno Novo');
  await form.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await form.getByLabel('Data de nascimento').fill('2000-01-01');
  await form.getByLabel('Telefone', { exact: true }).fill('(11) 98765-4321');
  const submit = form.getByRole('button', { name: 'Salvar', exact: true });
  await submit.click();
  await expect(submit).toHaveAttribute('aria-busy', 'true');
  await expect(submit).toBeDisabled();
  await expect(submit.locator('[data-slot="spinner"]')).toBeVisible();

  // a edição oferece "Cancelar" e ele volta para a tela anterior
  for (const [path, back] of [
    [`/students/${STUDENT_ID}/edit`, `/students/${STUDENT_ID}`],
    [`/staff/${STAFF_ID}/edit`, `/staff/${STAFF_ID}`],
    [`/plans/${PLAN_ID}/edit`, '/plans'],
  ] as const) {
    await page.goto(path);
    const cancel = mainOf(page).locator('form').getByRole('link', { name: 'Cancelar', exact: true });
    await expect(cancel, path).toBeVisible();
    await cancel.click();
    await expect(page, path).toHaveURL(back);
  }
});

// C57 - os prazos com a unidade dentro do campo, o "Desligado" temático e uma linha de efeito por campo
test('privacy_retention_fields_show_unit_themed_switch_and_effect_line', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto('/privacy');

  const fields = mainOf(page).locator('[data-slot="unit-field"]');
  await expect(fields).toHaveCount(2);
  for (const [index, unit] of ['anos', 'dias'].entries()) {
    const field = fields.nth(index);
    const unitLocator = field.locator('[data-slot="unit"]');
    await expect(unitLocator).toHaveText(unit);
    const fieldBox = (await field.boundingBox())!;
    const unitBox = (await unitLocator.boundingBox())!;
    // a unidade está dentro da borda do campo
    expect(unitBox.x).toBeGreaterThan(fieldBox.x);
    expect(unitBox.x + unitBox.width).toBeLessThanOrEqual(fieldBox.x + fieldBox.width);
    expect(unitBox.y).toBeGreaterThanOrEqual(fieldBox.y);
  }

  // o "Desligado" é um interruptor do tema, nunca o checkbox nativo
  const off = mainOf(page).getByRole('switch', { name: 'Desligado', exact: true });
  await expect(off).toBeVisible();
  await expect(off).toHaveAttribute('aria-checked', 'true');
  expect(await mainOf(page).locator('input[type="checkbox"]').count()).toBe(0);
  await off.click();
  await expect(off).toHaveAttribute('aria-checked', 'false');
  expect(await off.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgb(26, 26, 26)');

  // uma linha de efeito por campo
  const effects = mainOf(page).locator('[data-slot="effect"]');
  await expect(effects).toHaveCount(2);
  for (const effect of await effects.allTextContents()) expect(effect.length).toBeGreaterThan(10);
});

// C58 - o título de página no `ScreenHeader` e os dois cartões com a mesma largura a partir de 768 px
test('account_has_screen_header_and_equal_cards', async ({ page, api }) => {
  serveWorld(api, 'reception');
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/account');
    const header = mainOf(page).locator(SHELL_HEADER);
    await expect(header, `${width}`).toHaveCount(1);
    await expect(header.getByRole('heading', { level: 2 }), `${width}`).toHaveText('Minha conta');
    const cards = mainOf(page).locator('section');
    await expect(cards, `${width}`).toHaveCount(2);
    const widths = await cards.evaluateAll((sections) => sections.map((section) => Math.round(section.getBoundingClientRect().width)));
    expect(widths[0], `${width}`).toBe(widths[1]!);
  }
  // os títulos dos cartões ficam abaixo dos 30 px do título da página
  const cardTitle = mainOf(page).locator('section h3').first();
  expect(Number.parseFloat((await cssOf(cardTitle, ['font-size']))['font-size']!)).toBeLessThan(30);
});

// C59 - o resultado do check-in na geometria do `Panel`, o badge "Liberado" nos tokens e o `Alert`
test('check_in_panel_status_ok_badge_and_alert', async ({ page, api }) => {
  serveWorld(api, 'admin');
  const status = statusOf(listItemOf(1).id);
  const item = listItemOf(1, { id: status.student.id, name: status.student.name });
  serveSearch(api, 'reception', [item]);
  servePhotos(api, [item.photoUrl, status.photoUrl]);
  api.on('GET', statusPath(status.student.id), { status: 200, body: status });
  api.on('POST', checkInsPath(status.student.id), {
    status: 201,
    body: { id: '018f0000-0000-7000-8000-0000000c3001', day: '2026-10-07', checkedInAt: LATE },
  });
  await page.goto('/check-in');
  const field = page.getByLabel('Nome ou CPF', { exact: true });
  await field.fill('Rafaela');
  await field.press('Enter');

  // o resultado usa a geometria do `Panel`: o cartão do tema com a região no nome do aluno
  const card = mainOf(page).getByRole('region', { name: 'Rafaela Prado Cunha', exact: true });
  await expect(card).toBeVisible();
  expect(await cssOf(card, ['background-color', 'border-top-left-radius'])).toEqual({
    'background-color': 'rgb(15, 15, 15)',
    'border-top-left-radius': '16px',
  });

  // "Liberado" usa `--status-ok` sobre `--status-ok-surface`
  const badge = card.locator('[data-slot="status-badge"]');
  await expect(badge).toHaveText('Liberado');
  expect(await colorOf(badge)).toMatchObject({ r: 252, g: 244, b: 60 });
  near(await colorOf(badge, 'background-color'), { r: 252, g: 244, b: 60, a: 36 }, 'Liberado');

  // o retorno de sucesso é um `Alert`
  await page.getByRole('button', { name: 'Registrar presença', exact: true }).click();
  const registered = card.getByRole('alert');
  await expect(registered).toBeVisible();
  await expect(registered).toContainText('Presença registrada às');
});

// C60 - o valor do plano à direita e tabular, as regras em no máximo duas linhas e a situação em badge
test('plans_value_is_tabular_rules_are_two_lines_and_status_is_a_badge', async ({ page, api }) => {
  serveWorld(api, 'admin');
  const rules = 'Acesso livre de segunda a sábado, das 06:00 às 22:00, com acompanhamento da equipe e avaliação a cada três meses.';
  api.on('GET', '/api/plans', { status: 200, body: { items: [planOf({ rules })] } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plans');

  const table = mainOf(page).locator('table');
  const value = table.locator('tbody td:nth-child(3)').first();
  expect(await cssOf(value, ['text-align', 'font-variant-numeric'])).toEqual({
    'text-align': 'right',
    'font-variant-numeric': 'tabular-nums',
  });
  const rulesCell = table.locator('tbody td:nth-child(4)').first();
  const clamped = rulesCell.locator('span').first();
  expect(await cssOf(clamped, ['-webkit-line-clamp'])).toEqual({ '-webkit-line-clamp': '2' });
  const lineHeight = Number.parseFloat((await cssOf(clamped, ['line-height']))['line-height']!);
  const cellHeight = (await rulesCell.boundingBox())!.height;
  expect(cellHeight).toBeLessThanOrEqual(lineHeight * 2 + 32);
  await expect(table.locator('tbody [data-slot="status-badge"]').first()).toHaveText('Ativo');
});

// C61 - um bloco que falha mostra um `Alert` e os outros blocos continuam na tela
test('one_failed_block_shows_one_alert_and_keeps_the_others', async ({ page, api }) => {
  serveWorld(api, 'admin');
  api.on('GET', `/api/students/${STUDENT_ID}/payments`, problem(500, 'internal_error'));
  await page.goto(`/students/${STUDENT_ID}`);

  const alerts = mainOf(page).getByRole('alert');
  await expect(alerts).toHaveCount(1);
  await expect(alerts).toHaveText('Não foi possível carregar os pagamentos.');
  // a falha é do bloco: cabeçalho, identidade e os outros blocos seguem renderizando
  await expect(mainOf(page).locator(SHELL_HEADER)).toBeVisible();
  await expect(mainOf(page).locator('[data-slot="identity"]')).toBeVisible();
  for (const region of ['Responsável e consentimentos', 'Matrículas', 'Presenças', 'Privacidade']) {
    await expect(mainOf(page).getByRole('region', { name: region, exact: true }), region).toBeVisible();
  }
});

// C62 - cartão linkado, link de texto, botão e linha de tabela respondem como a AC 23 e a AC 9
test('team_hover_and_press_match_the_landing_motion', async ({ page, api }) => {
  test.setTimeout(180_000);
  serveWorld(api, 'admin');

  // o cartão linkado da lista sobe 2 px no hover
  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto('/students');
  const card = mainOf(page).locator('[data-slot="panel-rows"] > li').first();
  await expect(card.locator('a')).toHaveCount(1);
  expect((await cssOf(card, ['transform']))['transform']).toBe('none');
  await card.hover();
  await page.waitForTimeout(250);
  expect((await cssOf(card, ['transform']))['transform']).toBe('matrix(1, 0, 0, 1, 0, -2)');

  // o link de texto desenha a régua no hover
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/students');
  const link = mainOf(page).locator('table a').first();
  expect((await styleOf(link, 'transform', '::after')).raw).toBe('matrix(0, 0, 0, 1, 0, 0)');
  await link.hover();
  await page.waitForTimeout(250);
  expect((await styleOf(link, 'transform', '::after')).raw).toBe('matrix(1, 0, 0, 1, 0, 0)');

  // a linha da tabela muda o fundo para `--muted` a 50% (AC 9)
  const row = mainOf(page).locator('tbody tr').first();
  await row.hover();
  await page.waitForTimeout(250);
  near(await colorOf(row, 'background-color'), { r: 26, g: 26, b: 26, a: 128 }, 'linha');

  // o botão sobe 1 px no hover e encolhe a 0.98 pressionado
  const button = mainOf(page).getByRole('link', { name: 'Novo aluno', exact: true });
  await button.hover();
  await page.waitForTimeout(250);
  expect((await cssOf(button, ['transform']))['transform']).toBe('matrix(1, 0, 0, 1, 0, -1)');
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  expect((await cssOf(button, ['transform']))['transform']).toBe('matrix(0.98, 0, 0, 0.98, 0, 0)');
  await page.mouse.up();

  // com movimento reduzido nada se move
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto('/students');
  const stillCard = mainOf(page).locator('[data-slot="panel-rows"] > li').first();
  await stillCard.hover();
  await page.waitForTimeout(250);
  expect((await cssOf(stillCard, ['transform']))['transform']).toBe('none');
  const stillLink = mainOf(page).locator('table a').first();
  expect((await styleOf(stillLink, 'transition-duration', '::after')).raw).toBe('0s');
  const stillButton = mainOf(page).getByRole('link', { name: 'Novo aluno', exact: true });
  await stillButton.hover();
  await page.waitForTimeout(250);
  expect((await cssOf(stillButton, ['transform']))['transform']).toBe('none');
});

// C64 - as 22 rotas com `Shell` sem rolagem horizontal, o título de 30 px e os gutters 16/32
test('shell_screens_keep_no_horizontal_scroll_and_the_pinned_title_and_gutters', async ({ page, api }) => {
  test.setTimeout(300_000);
  serveWorld(api, 'admin');
  expect(SHELL_ROUTES).toHaveLength(22);

  for (const size of [
    { width: 360, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    for (const path of SHELL_ROUTES) {
      await page.goto(path);
      await expect(mainOf(page), path).toBeVisible();
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll, `${size.width} ${path}`).toBe(widths.client);
      const padding = await cssOf(mainOf(page), ['padding-left', 'padding-right']);
      expect(padding, `${size.width} ${path}`).toEqual(
        size.width === 360
          ? { 'padding-left': '16px', 'padding-right': '16px' }
          : { 'padding-left': '32px', 'padding-right': '32px' },
      );
    }
  }

  // as 20 telas continuam com o título de 30 px em peso 500 (as de impressão não têm `ScreenHeader`)
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of THE_TWENTY) {
    await page.goto(path);
    const title = mainOf(page).locator('[data-slot="screen-header-title"]');
    await expect(title, path).toHaveCount(1);
    expect(await cssOf(title, ['font-size', 'font-weight']), path).toEqual({ 'font-size': '30px', 'font-weight': '500' });
  }
});
