import type { MyProfile, StudentPayment } from '@academia/contracts';
import type { Locator } from '@playwright/test';
import { expect, type FakeApi, servePhotoFile, sessionOf, test } from './support/fake-api.ts';
import { serveWorld } from './support/identidade.ts';
import { periodOf } from './support/payments.ts';
import { PHOTO_PATH, PHOTO_URL } from './support/photo.ts';

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
