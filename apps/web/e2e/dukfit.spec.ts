import type { DashboardResponse, Role } from '@academia/contracts';
import type { Locator, Page } from '@playwright/test';
import { CARD_TITLES, card, cardTitles, dashboardFor, dashboardOf, serveDashboard, under } from './support/dashboard.ts';
import { expect, problem, sessionOf, test } from './support/fake-api.ts';
import { BORDER, CARD, HEADER, LIME, SCREENS, STAFF, STUDENT, serveWorld, styleOf } from './support/identidade.ts';
import { SITE } from '../src/app/site-content.ts';

/**
 * A prova da `dukfit-app` (`.specs/features/dukfit-app`): o shell, o painel e a landing do de-para,
 * lidos de um Chromium real sobre o build de produção, no celular (390×844 e 360×800) e no
 * computador (1440×900).
 */

const MOBILE = { width: 390, height: 844 };
const NARROW = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const TILE = 'rgb(26, 26, 26)';
const ORANGE = 'rgb(245, 158, 11)';
const OFF = 'rgb(64, 64, 64)';

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Abas', exact: true });
const side = (page: Page) => page.locator('[data-slot="side-nav"]');
const fab = (page: Page) => page.getByRole('link', { name: 'Registrar check-in', exact: true });

/** Os nomes acessíveis dos links e botões de um escopo, na ordem do DOM. */
const namesOf = (scope: Locator) =>
  scope.locator('a, button').evaluateAll((elements) =>
    elements.map((element) => (element.getAttribute('aria-label') ?? (element as HTMLElement).innerText).trim()),
  );

const SHELL_SCREENS = SCREENS.filter((screen) => screen.shell);

/** O slogan da landing, as três linhas lidas como um nome só (dukfit-landing, door 3). */
const TAGLINE = SITE.tagline.join(' ');

const dashboardWith = (checkIns: DashboardResponse['checkIns'], overrides: Partial<DashboardResponse> = {}) =>
  dashboardOf({ checkIns, ...overrides });

const week = (counts: number[], count = counts.at(-1)!) => ({
  count,
  lastSevenDays: counts.map((value, index) => ({ day: `2026-10-0${index + 1}`, count: value })),
});

// S1 - shell

test('title_and_wordmark_are_dukfit_on_shell_login_and_landing', async ({ page, api }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DukFit');
  await expect(page.locator('[data-slot="wordmark"]').first()).toHaveText('DukFit');

  await page.goto('/login');
  await expect(page).toHaveTitle('DukFit');
  await expect(page.locator('[data-slot="wordmark"]')).toHaveText('DukFit');

  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  await page.goto('/students');
  await expect(page).toHaveTitle('DukFit');
  await expect(page.getByRole('banner').getByRole('heading', { level: 1, name: 'DukFit' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 }).locator('[data-slot="wordmark"]')).toHaveText('DukFit');
});

test('header_shows_avatar_initials_name_and_profile_for_four_roles', async ({ page, api }) => {
  serveWorld(api, 'admin');
  const profiles: Record<Role, string> = {
    admin: 'Perfil: Administrador',
    reception: 'Perfil: Recepção',
    hr_finance: 'Perfil: RH/Financeiro',
    instructor: 'Perfil: Instrutor',
  };
  for (const [role, profile] of Object.entries(profiles) as Array<[Role, string]>) {
    api.session = sessionOf(role);
    await page.goto('/students');
    const avatar = page.locator('[data-slot="avatar"]');
    await expect(avatar, role).toHaveText('MD');
    const box = (await avatar.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)], role).toEqual([44, 44]);
    expect((await styleOf(avatar, 'border-radius')).raw, role).toBe('50%');
    await expect(page.getByRole('banner').getByText('Marina Duarte', { exact: true }), role).toBeVisible();
    await expect(page.getByRole('banner').getByText(profile, { exact: true }), role).toBeVisible();
  }

  api.session = sessionOf('reception', { name: 'Ana' });
  await page.goto('/students');
  await expect(page.locator('[data-slot="avatar"]')).toHaveText('A');

  // a disposição da referência: avatar e nome à esquerda, o botão redondo de 44 px à direita
  for (const size of [MOBILE, DESKTOP]) {
    await page.setViewportSize(size);
    await page.goto('/students');
    const avatar = (await page.locator('[data-slot="avatar"]').boundingBox())!;
    const name = (await page.getByRole('banner').getByText('Ana', { exact: true }).boundingBox())!;
    const menu = page.getByRole('banner').getByRole('button', { name: 'Menu', exact: true });
    const button = (await menu.boundingBox())!;
    expect(avatar.x, `${size.width}`).toBeLessThan(name.x);
    expect(name.x + name.width, `${size.width}`).toBeLessThan(button.x);
    expect(Math.abs(avatar.y + avatar.height / 2 - (button.y + button.height / 2)), `${size.width}`).toBeLessThanOrEqual(4);
    expect([Math.round(button.width), Math.round(button.height)], `${size.width}`).toEqual([44, 44]);
    expect((await styleOf(menu, 'border-radius')).raw, `${size.width}`).toBe('50%');
    const main = (await page.getByRole('main').boundingBox())!;
    expect(button.x + button.width, `${size.width}`).toBeGreaterThanOrEqual(main.x + main.width - 40);
  }
});

test('mobile_shows_the_fixed_bottom_nav_with_five_items_and_no_side_nav', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  await page.goto('/students');

  const nav = tabs(page);
  await expect(nav).toBeVisible();
  expect((await styleOf(nav, 'position')).raw).toBe('fixed');
  const box = (await nav.boundingBox())!;
  expect(MOBILE.height - (box.y + box.height)).toBeLessThanOrEqual(24);
  expect((await styleOf(nav, 'background-color')).rgb).toBe(CARD);
  expect((await styleOf(nav, 'border-radius')).raw).toBe('9999px');
  await expect(nav.locator('a, button')).toHaveCount(5);
  await expect(side(page)).toBeHidden();
});

test('bottom_nav_items_follow_the_priority_for_four_roles', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  const expected: Record<Role, string[]> = {
    admin: ['Início', 'Alunos', 'Check-in', 'Pagamentos', 'Mais'],
    hr_finance: ['Início', 'Alunos', 'Pagamentos', 'Planos', 'Mais'],
    reception: ['Início', 'Alunos', 'Check-in', 'Planos', 'Mais'],
    instructor: ['Início', 'Alunos', 'Mais'],
  };
  for (const [role, names] of Object.entries(expected) as Array<[Role, string[]]>) {
    api.session = sessionOf(role);
    await page.goto('/students');
    expect(await namesOf(tabs(page)), role).toEqual(names);
    for (const name of names) {
      const item = tabs(page).getByRole(name === 'Mais' ? 'button' : 'link', { name, exact: true });
      await expect(item, `${role} ${name}`).toBeVisible();
      const box = (await item.locator('svg').boundingBox())!;
      expect([Math.round(box.width), Math.round(box.height)], `${role} ${name}`).toEqual([20, 20]);
    }
  }
});

test('active_nav_item_has_aria_current_dark_pill_and_lime_icon', async ({ page, api }) => {
  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  for (const [size, nav] of [
    [MOBILE, tabs],
    [DESKTOP, (p: Page) => p.getByRole('navigation', { name: 'Menu principal', exact: true })],
  ] as const) {
    await page.setViewportSize(size);
    await page.goto('/students');
    const alunos = nav(page).getByRole('link', { name: 'Alunos', exact: true });
    const inicio = nav(page).getByRole('link', { name: 'Início', exact: true });
    await expect(alunos).toHaveAttribute('aria-current', 'page');
    expect((await styleOf(alunos, 'background-color')).rgb, `${size.width}`).toBe(HEADER);
    expect((await styleOf(alunos.locator('svg'), 'color')).rgb, `${size.width}`).toBe(LIME);
    await expect(inicio).not.toHaveAttribute('aria-current', 'page');
    expect((await styleOf(inicio, 'background-color')).rgb, `${size.width}`).not.toBe(HEADER);
    expect((await styleOf(inicio.locator('svg'), 'color')).rgb, `${size.width}`).not.toBe(LIME);
  }
});

test('more_menu_lists_every_allowed_link_account_and_sign_out', async ({ page, api }) => {
  serveWorld(api, 'admin');
  const expected: Partial<Record<Role, string[]>> = {
    admin: [
      'Início',
      'Alunos',
      'Check-in',
      'Presenças',
      'Planos',
      'Pagamentos',
      'Funcionários',
      'Usuários',
      'Auditoria',
      'Privacidade',
      'Minha conta',
    ],
    instructor: ['Início', 'Alunos', 'Minha conta'],
  };
  for (const [role, links] of Object.entries(expected) as Array<[Role, string[]]>) {
    api.session = sessionOf(role);

    // pela aba "Mais", no celular
    await page.setViewportSize(MOBILE);
    await page.goto('/students');
    await tabs(page).getByRole('button', { name: 'Mais', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog, role).toBeVisible();
    expect(await namesOf(dialog.getByRole('navigation', { name: 'Mais opções' })), role).toEqual(links);
    await expect(dialog.getByRole('button', { name: 'Sair', exact: true }), role).toBeVisible();
    await page.keyboard.press('Escape');

    // pelo botão do cabeçalho, no computador
    await page.setViewportSize(DESKTOP);
    await page.goto('/students');
    await page.getByRole('banner').getByRole('button', { name: 'Menu', exact: true }).click();
    dialog = page.getByRole('dialog');
    expect(await namesOf(dialog.getByRole('navigation', { name: 'Mais opções' })), role).toEqual(links);
    await expect(dialog.getByRole('button', { name: 'Sair', exact: true }), role).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('desktop_shows_the_side_nav_with_every_link_and_no_bottom_nav', async ({ page, api }) => {
  await page.setViewportSize(DESKTOP);
  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  await page.goto('/students');

  await expect(side(page)).toBeVisible();
  expect(Math.round((await side(page).boundingBox())!.width)).toBe(256);
  await expect(page.getByRole('heading', { level: 1, name: 'DukFit' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Menu principal', exact: true });
  const links = nav.getByRole('link');
  expect(await namesOf(nav)).toEqual([
    'Início',
    'Alunos',
    'Check-in',
    'Presenças',
    'Planos',
    'Pagamentos',
    'Funcionários',
    'Usuários',
    'Auditoria',
    'Privacidade',
    'Minha conta',
  ]);
  for (let index = 0; index < (await links.count()); index += 1) {
    const icon = links.nth(index).locator('svg');
    await expect(icon).toHaveCount(1);
    // o ícone ocupa a caixa dele: sem a classe de tamanho, um SVG só com `viewBox` encolhe a 0
    const box = (await icon.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)], `ícone ${index}`).toEqual([20, 20]);
  }
  await expect(side(page).getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
  await expect(tabs(page)).toBeHidden();
});

test('fab_links_to_check_in_for_admin_and_reception', async ({ page, api }) => {
  serveWorld(api, 'admin');
  for (const role of ['admin', 'reception'] as const) {
    for (const size of [MOBILE, DESKTOP]) {
      await page.setViewportSize(size);
      api.session = sessionOf(role);
      await page.goto('/students');
      const button = fab(page);
      await expect(button, role).toBeVisible();
      await expect(button, role).toHaveAttribute('href', '/check-in');
      const box = (await button.boundingBox())!;
      expect([Math.round(box.width), Math.round(box.height)], role).toEqual([56, 56]);
      expect((await styleOf(button, 'background-color')).rgb, role).toBe(LIME);
      expect((await styleOf(button, 'border-radius')).raw, role).toBe('50%');
      // flutua no canto inferior direito; no celular, acima da barra inferior
      expect((await styleOf(button, 'position')).raw, role).toBe('fixed');
      expect(size.width - (box.x + box.width), `${role} ${size.width}`).toBeLessThanOrEqual(32);
      if (size === MOBILE) {
        expect(box.y + box.height, role).toBeLessThanOrEqual((await tabs(page).boundingBox())!.y);
      } else {
        expect(size.height - (box.y + box.height), role).toBeLessThanOrEqual(32);
      }
    }
  }
});

test('fab_is_absent_for_hr_finance_and_instructor', async ({ page, api }) => {
  serveWorld(api, 'admin');
  for (const role of ['hr_finance', 'instructor'] as const) {
    api.session = sessionOf(role);
    await page.goto('/students');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Registrar check-in' }), role).toHaveCount(0);
  }
});

test('mobile_main_has_sixteen_gutter_and_clears_the_bottom_nav', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  await page.goto('/dashboard');

  const main = page.getByRole('main');
  expect((await styleOf(main, 'padding-left')).raw).toBe('16px');
  expect((await styleOf(main, 'padding-right')).raw).toBe('16px');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await main.evaluate((element) => element.lastElementChild!.getBoundingClientRect().bottom);
  const navTop = (await tabs(page).boundingBox())!.y;
  expect(last).toBeLessThanOrEqual(navTop);
});

test('no_horizontal_scroll_on_shell_screens_at_360_and_1440', async ({ page, api }) => {
  test.setTimeout(240_000);
  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  const paths = SHELL_SCREENS.map((screen) => screen.path);
  expect(paths).toHaveLength(21);
  expect(paths).toContain('/dashboard');

  for (const size of [NARROW, DESKTOP]) {
    await page.setViewportSize(size);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('main'), path).toBeVisible();
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(scroll, `${size.width} ${path}`).toBe(client);
    }
  }
});

// S2 - painel

test('dashboard_panels_follow_the_response_with_dark_surface_and_16_radius', async ({ page, api }) => {
  for (const role of ['instructor', 'admin'] as const) {
    serveDashboard(api, role);
    await page.goto('/dashboard');
    const titles = await cardTitles(page);
    expect(titles, role).toEqual(role === 'admin' ? CARD_TITLES : ['Alunos']);
    for (const title of titles) {
      const region = card(page, title);
      expect((await styleOf(region, 'background-color')).rgb, `${role} ${title}`).toBe(CARD);
      expect((await styleOf(region, 'border-radius')).raw, `${role} ${title}`).toBe('16px');
      const heading = region.getByRole('heading', { level: 3, name: title, exact: true });
      expect((await styleOf(heading, 'font-size')).raw, `${role} ${title}`).toBe('20px');
      expect((await styleOf(heading, 'font-weight')).raw, `${role} ${title}`).toBe('500');
    }
  }
});

test('panel_arrow_links_keep_the_accessible_names_and_32_size', async ({ page, api }) => {
  serveDashboard(api, 'admin');
  await page.goto('/dashboard');

  for (const [title, name, href] of [
    ['Alunos', 'Ver alunos', '/students'],
    ['Check-ins de hoje', 'Ver presenças de hoje', '/check-ins'],
  ] as const) {
    const link = card(page, title).getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', href);
    const box = (await link.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)], name).toEqual([32, 32]);
    expect((await styleOf(link, 'border-top-color')).rgb, name).toBe(BORDER);
    await expect(link.locator('svg'), name).toHaveCount(1);
  }
});

/** As cores de traço das marcas do medidor, na ordem. */
const ticksOf = (scope: Locator) =>
  scope.locator('[data-slot="gauge-tick"]').evaluateAll((lines) => lines.map((line) => getComputedStyle(line).stroke));

test('gauge_lights_ticks_in_proportion_to_the_week_max', async ({ page, api }) => {
  serveDashboard(api, 'admin', dashboardWith(week([2, 0, 5, 10, 8, 3, 4])));
  await page.goto('/dashboard');

  const panel = card(page, 'Check-ins de hoje');
  let ticks = await ticksOf(panel);
  expect(ticks).toHaveLength(40);
  expect(ticks.filter((stroke) => stroke === LIME)).toHaveLength(16);
  expect(ticks.filter((stroke) => stroke === OFF)).toHaveLength(24);
  // as acesas são as primeiras, da esquerda para a direita
  expect(ticks.slice(0, 16).every((stroke) => stroke === LIME)).toBe(true);
  await expect(panel.locator('[data-slot="gauge-value"]')).toHaveText('4');
  await expect(panel.locator('[data-slot="gauge-pill"]')).toHaveText('07/10/2026');

  // o arranjo: as marcas formam um semicírculo (pontas embaixo, meio no alto) e o número fica no centro
  const centers = await panel
    .locator('[data-slot="gauge-tick"]')
    .evaluateAll((lines) =>
      lines.map((line) => line.getBoundingClientRect()).map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })),
    );
  const [left, middle, right] = [centers[0]!, centers[19]!, centers[39]!];
  expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(2);
  expect(left.y - middle.y).toBeGreaterThan(60);
  // em volta do centro do arco, o ângulo de cada marca anda de 180° a 0° e a distância fica constante
  const center = { x: (left.x + right.x) / 2, y: left.y };
  const polar = centers.map(({ x, y }) => ({ angle: (Math.atan2(center.y - y, x - center.x) * 180) / Math.PI, radius: Math.hypot(x - center.x, y - center.y) }));
  for (let index = 1; index < polar.length; index += 1) expect(polar[index]!.angle).toBeLessThan(polar[index - 1]!.angle);
  expect(polar[0]!.angle).toBeGreaterThan(170);
  expect(polar.at(-1)!.angle).toBeLessThan(10);
  const radii = polar.map((point) => point.radius);
  expect(Math.max(...radii) / Math.min(...radii)).toBeLessThan(1.15);
  const value = (await panel.locator('[data-slot="gauge-value"]').boundingBox())!;
  expect(Math.abs(value.x + value.width / 2 - (left.x + right.x) / 2)).toBeLessThanOrEqual(6);
  // dentro do arco: abaixo da marca do alto e acima das pontas
  expect(value.y + value.height / 2).toBeGreaterThan(middle.y);
  expect(value.y + value.height / 2).toBeLessThan(left.y);

  serveDashboard(api, 'admin', dashboardWith(week([0, 0, 0, 0, 0, 0, 0])));
  await page.goto('/dashboard');
  ticks = await ticksOf(card(page, 'Check-ins de hoje'));
  expect(ticks).toHaveLength(40);
  expect(ticks.filter((stroke) => stroke === LIME)).toHaveLength(0);
  await expect(card(page, 'Check-ins de hoje').locator('[data-slot="gauge-value"]')).toHaveText('0');
});

test('week_bars_label_weekdays_oldest_first_with_counts', async ({ page, api }) => {
  serveDashboard(api, 'reception', dashboardFor('reception', dashboardWith(week([3, 0, 7, 10, 5, 2, 6]))));
  await page.goto('/dashboard');

  const panel = card(page, 'Check-ins da semana');
  const columns = panel.locator('[data-slot="week-column"]');
  await expect(columns).toHaveCount(7);
  expect(await panel.locator('[data-slot="week-day"]').allTextContents()).toEqual(['QUI', 'SEX', 'SÁB', 'DOM', 'SEG', 'TER', 'QUA']);
  expect(await panel.locator('[data-slot="week-count"]').allTextContents()).toEqual(['3', '0', '7', '10', '5', '2', '6']);
  expect(await columns.evaluateAll((items) => items.map((item) => item.getAttribute('data-day')))).toEqual([
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
    '2026-10-04',
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
  ]);
  // o número fica acima das barras
  const first = columns.first();
  const countBox = (await first.locator('[data-slot="week-count"]').boundingBox())!;
  const barBox = (await first.locator('[data-slot="week-bar"]').first().boundingBox())!;
  expect(countBox.y + countBox.height).toBeLessThanOrEqual(barBox.y);
});

test('week_bar_colors_follow_the_ninety_percent_rule', async ({ page, api }) => {
  serveDashboard(api, 'admin', dashboardWith(week([10, 9, 8, 1, 0, 10, 5])));
  await page.goto('/dashboard');

  const columns = card(page, 'Check-ins da semana').locator('[data-slot="week-column"]');
  const colors = await columns.evaluateAll((items) =>
    items.map((item) => [...item.querySelectorAll('[data-slot="week-bar"]')].map((bar) => getComputedStyle(bar).backgroundColor)),
  );
  expect(colors).toEqual(
    [LIME, LIME, ORANGE, ORANGE, OFF, LIME, ORANGE].map((color) => [color, color, color]),
  );
});

test('students_panel_main_number_and_two_pills', async ({ page, api }) => {
  serveDashboard(api, 'instructor');
  await page.goto('/dashboard');

  const students = card(page, 'Alunos');
  await expect(under(students, 'Ativos')).toHaveText('31');
  expect(Number.parseFloat((await styleOf(under(students, 'Ativos'), 'font-size')).raw)).toBeGreaterThanOrEqual(32);
  const pills = students.locator('[data-slot="stat-pill"]');
  await expect(pills).toHaveCount(2);
  for (const [index, label, value] of [
    [0, 'Inativos', '4'],
    [1, 'Suspensos', '2'],
  ] as const) {
    const pill = pills.nth(index);
    await expect(pill.locator('dt')).toHaveText(label);
    await expect(pill.locator('dd')).toHaveText(value);
    expect((await styleOf(pill, 'background-color')).rgb, label).toBe(HEADER);
    expect(Number.parseFloat((await styleOf(pill, 'border-radius')).raw), label).toBeGreaterThanOrEqual(9999);
    expect((await styleOf(pill.locator('[data-slot="stat-pill-dot"]'), 'background-color')).rgb, label).toBe(LIME);
  }
});

test('metric_tiles_for_enrollments_and_payments', async ({ page, api }) => {
  serveDashboard(api, 'admin');
  await page.goto('/dashboard');

  for (const [title, label, value, href] of [
    ['Matrículas', 'Ativas', '27', undefined],
    ['Matrículas', 'Agendadas', '6', undefined],
    ['Pagamentos', 'Pendentes', '9', '/payments?status=pending'],
    ['Pagamentos', 'Atrasados', '4', '/payments?status=overdue'],
  ] as const) {
    const tile = card(page, title).locator('[data-slot="metric-tile"]', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) });
    await expect(tile, label).toHaveCount(1);
    expect((await styleOf(tile, 'background-color')).rgb, label).toBe(TILE);
    expect((await styleOf(tile.locator('dt'), 'color')).rgb, label).toBe(LIME);
    expect((await styleOf(tile, 'border-radius')).raw, label).toBe('16px');
    expect((await styleOf(tile.locator('dt'), 'font-size')).raw, label).toBe('12px');
    const number = tile.locator('dd');
    await expect(number, label).toHaveText(value);
    expect((await styleOf(number, 'font-size')).raw, label).toBe('24px');
    expect((await styleOf(number, 'font-variant-numeric')).raw, label).toBe('tabular-nums');
    if (href) await expect(number.getByRole('link', { name: value, exact: true }), label).toHaveAttribute('href', href);
  }
});

test('lists_are_rows_on_mobile_and_tables_from_768', async ({ page, api }) => {
  serveDashboard(api, 'admin');
  for (const [size, mobile] of [
    [MOBILE, true],
    [DESKTOP, false],
  ] as const) {
    await page.setViewportSize(size);
    await page.goto('/dashboard');
    for (const [title, text] of [
      ['Vencimentos nos próximos 7 dias', 'Ana Souza'],
      ['Matrículas ativas por plano', 'Mensal · Mensal'],
    ] as const) {
      const panel = card(page, title);
      if (mobile) {
        await expect(panel.locator('table'), title).toBeHidden();
        const rows = panel.locator('[data-slot="panel-rows"] > li');
        await expect(rows, title).toHaveCount(1);
        await expect(rows.first(), title).toContainText(text);
      } else {
        await expect(panel.locator('table'), title).toBeVisible();
        await expect(panel.locator('[data-slot="panel-rows"]'), title).toBeHidden();
        await expect(panel.locator('tbody'), title).toContainText(text);
      }
    }
  }
});

test('dashboard_grid_three_columns_on_desktop_one_on_mobile', async ({ page, api }) => {
  serveDashboard(api, 'admin');
  const columnsAt = async (size: { width: number; height: number }) => {
    await page.setViewportSize(size);
    await page.goto('/dashboard');
    return page
      .locator('[data-slot="dashboard-grid"]')
      .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
  };
  expect(await columnsAt(DESKTOP)).toBe(3);
  expect(await columnsAt(MOBILE)).toBe(1);
});

test('menu_button_dot_only_on_dashboard_with_overdue', async ({ page, api }) => {
  const menu = () => page.getByRole('banner').getByRole('button', { name: 'Menu', exact: true });
  serveWorld(api, 'admin');
  serveDashboard(api, 'admin', dashboardOf({ payments: { pending: 9, overdue: 4 } }));
  await page.goto('/dashboard');

  const dot = menu().locator('[data-slot="menu-dot"]');
  await expect(dot).toHaveCount(1);
  const box = (await dot.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([8, 8]);
  expect((await styleOf(dot, 'background-color')).rgb).toBe(LIME);
  await expect(menu()).toHaveAccessibleDescription('Há pagamentos atrasados');

  serveDashboard(api, 'admin', dashboardOf({ payments: { pending: 9, overdue: 0 } }));
  await page.goto('/dashboard');
  await expect(menu().locator('[data-slot="menu-dot"]')).toHaveCount(0);
  await expect(menu()).toHaveAccessibleDescription('');

  serveDashboard(api, 'admin', dashboardOf({ payments: { pending: 9, overdue: 4 } }));
  await page.goto('/students');
  await expect(menu().locator('[data-slot="menu-dot"]')).toHaveCount(0);
});

// S4 - landing

test('landing_is_public_200_without_redirect', async ({ page, api }) => {
  expect(api.session).toBeUndefined();
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(response?.request().redirectedFrom()).toBeNull();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1, name: TAGLINE })).toBeVisible();
});

test('landing_sections_in_order_from_site_content', async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('main');

  // as seções da landing com o conteúdo real da academia (dukfit-landing, AC 3), cada uma nomeada pelo rótulo
  const regions = await main.locator('section[aria-labelledby]').evaluateAll((sections) =>
    sections.map((section) => document.getElementById(section.getAttribute('aria-labelledby')!)!.textContent!.trim()),
  );
  expect(regions).toEqual([
    TAGLINE,
    'Sobre a Dukfit',
    'O que você encontra',
    'Por que a Dukfit',
    'Nossa estrutura',
    'Planos',
    'Onde estamos',
    'Horário',
  ]);

  const cards = main.getByRole('region', { name: 'O que você encontra' }).locator('[data-slot="highlights"] > li');
  await expect(cards).toHaveCount(SITE.structure.length);
  for (const [index, item] of SITE.structure.entries()) {
    await expect(cards.nth(index).getByRole('heading', { name: item.title })).toBeVisible();
    await expect(cards.nth(index)).toContainText(item.text);
  }
  const location = main.getByRole('region', { name: 'Onde estamos' });
  await expect(location.locator('address')).toContainText(SITE.address.street);
  await expect(location.locator('address')).toContainText(SITE.address.district);
  await expect(page.locator('footer')).toBeVisible();
});

test('landing_cta_depends_on_session', async ({ page, api }) => {
  await page.goto('/');
  const enter = page.getByRole('link', { name: 'Acesso da equipe', exact: true });
  await expect(enter).toHaveAttribute('href', '/login');
  expect((await styleOf(enter, 'background-color')).rgb).toBe(LIME);
  await expect(page.getByRole('link', { name: 'Ir para o painel' })).toHaveCount(0);

  api.session = sessionOf('reception');
  await page.goto('/');
  const go = page.getByRole('link', { name: 'Ir para o painel', exact: true });
  await expect(go).toHaveAttribute('href', '/dashboard');
  expect((await styleOf(go, 'background-color')).rgb).toBe(LIME);
  await expect(page.getByRole('link', { name: 'Acesso da equipe' })).toHaveCount(0);
});

test('landing_has_no_shell_no_external_request_and_no_csp_violation', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (event) => violations.push(event.violatedDirective));
  });
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  // o único `banner` é o cabeçalho flutuante da landing (motion, door 7), não o do shell
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('banner')).toHaveAttribute('data-slot', 'site-header');
  // só as âncoras da própria página: nenhuma navegação do shell
  const navigations = () => page.getByRole('navigation').evaluateAll((navs) => navs.map((nav) => nav.getAttribute('aria-label')));
  expect(await navigations()).toEqual(['Seções', 'Rodapé']);
  await expect(page.getByRole('link', { name: 'Registrar check-in' })).toHaveCount(0);

  // no celular as seções ficam no menu do cabeçalho
  await page.setViewportSize(MOBILE);
  expect(await navigations()).toEqual(['Rodapé']);
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('navigation', { name: 'Seções', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  expect([...origins]).toEqual([new URL(baseURL!).origin]);
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
});

test('landing_section_heads_one_column_mobile_two_desktop', async ({ page }) => {
  const columnsAt = async (size: { width: number; height: number }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    return page
      .locator('[data-slot="section-head"]')
      .first()
      .evaluate((head) => getComputedStyle(head).gridTemplateColumns.split(' ').filter(Boolean).length);
  };
  // o rótulo à esquerda e o título à direita só no computador, como na referência
  expect(await columnsAt(MOBILE)).toBe(1);
  expect(await columnsAt(DESKTOP)).toBe(2);
});

// S5 - rotas e entrada

test('pending_two_factor_sees_landing_and_is_sent_to_setup_from_dashboard', async ({ page, api }) => {
  api.session = sessionOf('admin', { twoFactorEnabled: false });
  expect(api.session.twoFactorEnrollmentRequired).toBe(true);

  await page.goto('/');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1, name: TAGLINE })).toBeVisible();

  await page.goto('/dashboard');
  await expect(page).toHaveURL('/two-factor/setup');
});

test('login_is_the_welcome_back_screen', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('[data-slot="wordmark"]')).toHaveText('DukFit');
  await expect(page.getByRole('heading', { level: 1, name: 'Bem-vindo de volta', exact: true })).toBeVisible();

  for (const label of ['E-mail', 'Senha']) {
    const input = page.getByLabel(label, { exact: true });
    await expect(input, label).toBeVisible();
    const icon = input.locator('xpath=preceding-sibling::*[1]').locator('svg');
    await expect(icon, label).toHaveCount(1);
    const iconBox = (await icon.boundingBox())!;
    const inputBox = (await input.boundingBox())!;
    expect(iconBox.x, label).toBeGreaterThan(inputBox.x);
    expect(iconBox.x + iconBox.width, label).toBeLessThan(inputBox.x + 48);
  }

  const submit = page.getByRole('button', { name: 'Entrar', exact: true });
  expect((await styleOf(submit, 'background-color')).rgb).toBe(LIME);
  const form = page.locator('form');
  expect(Math.round((await submit.boundingBox())!.width)).toBe(Math.round((await form.boundingBox())!.width));
});

test('inicio_goes_to_dashboard_and_not_found_links_to_root', async ({ page, api }) => {
  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  await page.goto('/students');
  const inicio = page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Início', exact: true });
  await expect(inicio).toHaveAttribute('href', '/dashboard');
  await inicio.click();
  await expect(page).toHaveURL('/dashboard');

  const response = await page.goto('/rota-que-nao-existe');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar ao início', exact: true })).toHaveAttribute('href', '/');
});

// S6 - telas internas

test('inner_screens_have_30_medium_title_and_dark_panels', async ({ page, api }) => {
  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  for (const path of ['/students', '/students/new', `/students/${STUDENT.id}`, '/plans', '/account', '/check-in', '/users']) {
    await page.goto(path);
    const title = page.getByRole('main').locator('h2').first();
    await expect(title, path).toBeVisible();
    expect((await styleOf(title, 'font-size')).raw, path).toBe('30px');
    expect((await styleOf(title, 'font-weight')).raw, path).toBe('500');

    // o bloco do conteúdo: o irmão seguinte da linha do título ou, na conta, a seção que o contém
    const panel = await title.evaluate((heading) => {
      const row = heading.parentElement!.tagName === 'MAIN' ? heading : heading.parentElement!;
      const blocks = [row.nextElementSibling, heading.closest('section')].filter((element) => element !== null);
      for (const element of blocks) element.setAttribute('data-probe', 'panel');
      return blocks.length;
    });
    expect(panel, path).toBeGreaterThan(0);
    const blocks = page.locator('[data-probe="panel"]');
    const styles = [];
    for (let index = 0; index < (await blocks.count()); index += 1) {
      styles.push({
        background: (await styleOf(blocks.nth(index), 'background-color')).rgb,
        radius: (await styleOf(blocks.nth(index), 'border-top-left-radius')).raw,
      });
    }
    expect(styles, path).toContainEqual({ background: CARD, radius: '16px' });
  }
});

test('mobile_tables_scroll_inside_panel_and_forms_are_full_width', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  api.session = sessionOf('admin');

  await page.goto('/students');
  const table = page.getByRole('main').locator('table').first();
  await expect(table).toBeAttached();
  const wrapper = await table.evaluate((element) => {
    const parent = element.parentElement!;
    return { overflow: getComputedStyle(parent).overflowX, table: element.scrollWidth, wrapper: parent.clientWidth };
  });
  expect(wrapper.overflow).toBe('auto');
  expect(wrapper.table).toBeGreaterThanOrEqual(wrapper.wrapper);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);

  await page.goto('/students/new');
  const form = page.getByRole('main').locator('form').first();
  const formWidth = Math.round((await form.boundingBox())!.width);
  const controls = form.locator('input[type="text"], input[type="email"], input[type="tel"], input[type="date"], input:not([type]), select');
  expect(await controls.count()).toBeGreaterThan(3);
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    expect(Math.round((await control.boundingBox())!.width), `campo ${index}`).toBe(formWidth);
  }
  const submit = form.locator('button[type="submit"]');
  expect(Math.round((await submit.boundingBox())!.width)).toBe(formWidth);
});

test('print_pages_have_no_shell_nav_or_fab', async ({ page, api }) => {
  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  await page.emulateMedia({ media: 'print' });
  for (const size of [MOBILE, DESKTOP]) {
    await page.setViewportSize(size);
    for (const path of [`/students/${STUDENT.id}/print`, `/staff/${STAFF.id}/print`]) {
      await page.goto(path);
      await expect(page.getByRole('main'), path).toBeVisible();
      await expect(page.getByRole('banner'), path).toBeHidden();
      await expect(page.getByRole('navigation'), path).toHaveCount(0);
      await expect(fab(page), path).toBeHidden();
      await expect(page.locator('[data-slot="side-nav"]'), path).toBeHidden();
    }
  }
});

test('dashboard_load_error_keeps_the_shell', async ({ page, api }) => {
  api.session = sessionOf('admin');
  api.on('GET', '/api/dashboard', problem(500, 'internal_error'));
  await page.goto('/dashboard');
  await expect(page.getByText('Não foi possível carregar o painel.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'DukFit' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
});

// rodada 2 da verificação: as bordas dos pontos de virada e os horários no medidor

test('breakpoints_switch_at_768_and_1024', async ({ page, api }) => {
  serveWorld(api, 'admin');
  serveDashboard(api, 'admin');
  const at = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dashboard');
    const expiring = card(page, 'Vencimentos nos próximos 7 dias');
    return {
      tabs: await tabs(page).isVisible(),
      side: await side(page).isVisible(),
      grid: await page
        .locator('[data-slot="dashboard-grid"]')
        .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length),
      table: await expiring.locator('table').isVisible(),
      rows: await expiring.locator('[data-slot="panel-rows"]').isVisible(),
    };
  };
  // o gutter do conteúdo acompanha a barra: 16 px abaixo de 1024 px, 32 px a partir dele (AC 10)
  const gutter = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dashboard');
    const main = page.getByRole('main');
    return [(await styleOf(main, 'padding-left')).raw, (await styleOf(main, 'padding-right')).raw];
  };
  expect(await gutter(1023)).toEqual(['16px', '16px']);
  expect(await gutter(1024)).toEqual(['32px', '32px']);

  expect(await at(767)).toEqual({ tabs: true, side: false, grid: 1, table: false, rows: true });
  expect(await at(768)).toEqual({ tabs: true, side: false, grid: 2, table: true, rows: false });
  expect(await at(1023)).toEqual({ tabs: true, side: false, grid: 2, table: true, rows: false });
  expect(await at(1024)).toEqual({ tabs: false, side: true, grid: 3, table: true, rows: false });

  api.session = undefined;
  const heads = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    return page
      .locator('[data-slot="section-head"]')
      .first()
      .evaluate((head) => getComputedStyle(head).gridTemplateColumns.split(' ').filter(Boolean).length);
  };
  expect(await heads(767)).toBe(1);
  expect(await heads(1023)).toBe(1);
  expect(await heads(1024)).toBe(2);
});
