import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { checkInsPath, LATE, listItemOf, reportItemOf, reportOf, servePhotos, serveSearch, statusOf, statusPath } from './support/check-ins.ts';
import { expect, type FakeApi, problem, sessionOf, test } from './support/fake-api.ts';
import { SCREENS, serveWorld } from './support/identidade.ts';
import {
  animationOf,
  type Baseline,
  baselineOf,
  DESKTOP,
  fixtureIds,
  formHydrated,
  type Frame,
  framesOf,
  MOBILE,
  NARROW,
  settle,
  startSampling,
  translateYOf,
} from './support/motion.ts';
import { openPaymentOf, serveOpenPayments } from './support/payments.ts';
import { planOf, servePlans, stateOf, STUDENT_ID } from './support/plans.ts';
import { serveStaffAs, STAFF_ID, staffOf } from './support/staff.ts';

/**
 * A prova da `motion` (`.specs/features/motion`): transição de página, carregamento, ações, entrada
 * de listas e movimento reduzido, medidos quadro a quadro num Chromium real sobre o build de produção.
 */

const SHELL_PATHS = SCREENS.filter((screen) => screen.shell).map((screen) => screen.path);

// S1 - fundação

test('motion_provider_adds_no_element_to_the_body', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  await page.goto('/dashboard');
  await settle(page);
  // fora o que o Next e o React põem no `body` (scripts, folhas de estilo içadas, o anunciador de rota e
  // o `<div hidden>` dos metadados),
  // o único filho é a raiz da Shell: o provider não acrescenta elemento entre ela e o `body`
  const children = await page.evaluate(() =>
    [...document.body.children]
      .filter((element) => !['SCRIPT', 'LINK', 'NEXT-ROUTE-ANNOUNCER'].includes(element.tagName))
      .filter((element) => !(element.tagName === 'DIV' && element.hasAttribute('hidden') && element.children.length === 0))
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        shell: element.querySelector(':scope > header [data-slot="avatar"]') !== null,
      })),
  );
  expect(children).toEqual([{ tag: 'div', shell: true }]);
});

// S2 - transição de página

const NEW_MAIN = 'main[data-motion="page"]:not([data-old])';

/** Marca o `main` atual como antigo e amostra o `main` novo desde o quadro em que ele monta. */
async function sampleNewMain(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => document.querySelector('main')?.setAttribute('data-old', ''));
  await startSampling(page, [NEW_MAIN], { appear: true });
  await action();
  const frames = await framesOf(page);
  expect(frames.length, 'o main novo montou').toBeGreaterThan(0);
  return frames.map((frame) => ({ t: frame.t, style: frame.targets[0]! }));
}

/** De `/dashboard`, aciona o link "Alunos" visível (barra inferior no celular, lateral no computador). */
async function toStudents(page: Page) {
  await page.goto('/dashboard');
  await settle(page);
  return sampleNewMain(page, () => page.getByRole('link', { name: 'Alunos', exact: true }).filter({ visible: true }).first().click());
}

type Sample = { t: number; style: Record<string, string> };
const opacityOf = (frame: Sample) => Number(frame.style.opacity);
const yOf = (frame: Sample) => translateYOf(frame.style.transform!);

/** A entrada de página medida: começo, monotonia e o fim em 200 ms (± um quadro). */
function expectEntrance(frames: Sample[], low: number, high: number, label: string) {
  const [first] = frames;
  expect(opacityOf(first!), `${label} opacidade inicial`).toBeLessThanOrEqual(0.2);
  expect(yOf(first!), `${label} deslocamento inicial`).toBeGreaterThan(low);
  expect(yOf(first!), `${label} deslocamento inicial`).toBeLessThanOrEqual(high);
  for (let index = 1; index < frames.length; index += 1) {
    expect(opacityOf(frames[index]!), `${label} quadro ${index}`).toBeGreaterThanOrEqual(opacityOf(frames[index - 1]!));
    expect(yOf(frames[index]!), `${label} quadro ${index}`).toBeLessThanOrEqual(yOf(frames[index - 1]!));
  }
  const end = frames.find((frame) => frame.style.opacity === '1' && frame.style.transform === 'none');
  expect(end, `${label} chega ao fim`).toBeDefined();
  expect(Math.abs(end!.t - first!.t - 200), `${label} duração`).toBeLessThanOrEqual(17);
}

test('page_enters_with_opacity_and_eight_pixels_in_200ms_on_mobile', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  expectEntrance(await toStudents(page), 6, 8, '390');
});

test('page_distance_is_twelve_from_1024_and_eight_below', async ({ page, api }) => {
  serveWorld(api, 'admin');
  for (const [size, low, high] of [
    [DESKTOP, 10, 12],
    [{ width: 1024, height: 800 }, 10, 12],
    [{ width: 1023, height: 800 }, 6, 8],
  ] as const) {
    await page.setViewportSize(size);
    expectEntrance(await toStudents(page), low, high, `${size.width}`);
  }
});

test('first_document_renders_visible_without_transition', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  const html = await (await page.request.get('/dashboard')).text();
  const main = /<main\b[^>]*>/.exec(html)?.[0];
  expect(main).toBeDefined();
  const style = /style="([^"]*)"/.exec(main!)?.[1] ?? '';
  expect(style.replace(/\s/g, '')).not.toContain('opacity:0');
  expect(style).not.toContain('transform');

  // o amostrador entra antes de qualquer script da página e grava desde o primeiro quadro do documento
  await page.addInitScript(() => {
    const frames: Array<{ t: number; targets: Array<Record<string, string> | null> }> = [];
    Object.assign(window, { __frames: frames, __done: false });
    const tick = () => {
      const element = document.querySelector('main');
      if (element) {
        const style = getComputedStyle(element);
        frames.push({ t: performance.now(), targets: [{ opacity: style.opacity, transform: style.transform }] });
      }
      if (frames.length < 36) requestAnimationFrame(tick);
      else Object.assign(window, { __done: true });
    };
    requestAnimationFrame(tick);
  });
  await page.goto('/dashboard');
  const frames = await framesOf(page);
  expect(frames).toHaveLength(36);
  for (const frame of frames) expect(frame.targets[0]).toMatchObject({ opacity: '1', transform: 'none' });
});

/** Todo quadro de `main` e de cada descendente com opacidade 1 e sem `transform`. */
async function expectStill(page: Page, label: string) {
  await startSampling(page, ['main, main *'], { all: true });
  const frames = await framesOf(page);
  expect(frames.length, label).toBeGreaterThan(20);
  for (const frame of frames) {
    expect(frame.targets.length, label).toBeGreaterThan(10);
    for (const target of frame.targets) expect(target, label).toMatchObject({ opacity: '1', transform: 'none' });
  }
}

test('print_pages_render_without_page_or_entrance_motion', async ({ page, api }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  for (const [ficha, print] of [
    [`/students/${STUDENT_ID}`, `/students/${STUDENT_ID}/print`],
    [`/staff/${STAFF_ID}`, `/staff/${STAFF_ID}/print`],
  ] as const) {
    await page.goto(print);
    await expect(page.getByRole('button', { name: 'Imprimir' }), print).toBeVisible();
    await expect(page.locator('[data-motion="page"]'), print).toHaveCount(0);
    await expectStill(page, `${print} por goto`);

    await page.goto(ficha);
    await settle(page);
    await page.evaluate(() => document.querySelector('main')?.setAttribute('data-old', ''));
    // desde o clique: nenhum quadro do `main` novo e dos descendentes dele se move
    await startSampling(page, ['main:not([data-old]), main:not([data-old]) *'], { all: true, appear: true });
    await page.getByRole('link', { name: 'Versão para impressão' }).click();
    const frames = await framesOf(page);
    await expect(page).toHaveURL(print);
    expect(frames.length, `${print} pela ficha`).toBeGreaterThan(20);
    for (const frame of frames) {
      for (const target of frame.targets) expect(target, `${print} pela ficha`).toMatchObject({ opacity: '1', transform: 'none' });
    }
    await expect(page.getByRole('button', { name: 'Imprimir' }), print).toBeVisible();
    await expect(page.locator('[data-motion="page"]'), print).toHaveCount(0);
  }
});

test('reduced_motion_page_is_static', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  serveWorld(api, 'admin');
  const frames = await toStudents(page);
  expect(frames.length).toBeGreaterThan(20);
  for (const frame of frames) expect(frame.style).toMatchObject({ opacity: '1', transform: 'none' });
});

test('page_transition_animates_only_opacity_and_transform', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  const frames = await toStudents(page);
  expect(new Set(frames.map((frame) => frame.style.transform)).size, 'a transição aconteceu').toBeGreaterThan(1);
  const fixed = ['width', 'height', 'top', 'left', 'margin-top', 'padding-top', 'filter', 'clip-path'];
  for (const frame of frames) {
    expect(frame.style['pointer-events']).toBe('auto');
    for (const property of fixed) expect(frame.style[property], property).toBe(frames[0]!.style[property]);
  }
});

test('every_shell_route_has_one_page_motion_main', async ({ page, api }) => {
  test.setTimeout(180_000);
  serveWorld(api, 'admin');
  const routes = SHELL_PATHS.filter((path) => !path.endsWith('/print'));
  expect(routes).toHaveLength(20);
  for (const path of routes) {
    await page.goto(path);
    await expect(page.locator('[data-motion="page"]'), path).toHaveCount(1);
    await expect(page.locator('main'), path).toHaveCount(1);
    await expect(page.locator('main'), path).toHaveAttribute('data-motion', 'page');
  }
});

// S3 - carregamento

const SKELETON = '[data-slot="page-skeleton"]';

/** De `/dashboard`, aciona "Alunos" com a lista da API falsa presa: a tela fica no esqueleto. */
async function toHangingStudents(page: Page, api: FakeApi) {
  serveWorld(api, 'admin');
  api.on('GET', '/api/students', 'hang');
  await page.goto('/dashboard');
  await settle(page);
  await page.getByRole('link', { name: 'Alunos', exact: true }).filter({ visible: true }).first().click();
  await expect(page.locator(SKELETON)).toBeVisible();
}

test('pending_navigation_shows_the_page_skeleton', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  await toHangingStudents(page, api);
  const skeleton = page.locator(SKELETON);
  await expect(skeleton).toHaveCount(1);
  await expect(skeleton).toHaveAttribute('role', 'status');
  await expect(skeleton).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('status', { name: /Carregando…/ })).toHaveCount(1);
  // a tela de verdade ainda não chegou
  await expect(page.locator('main')).toHaveCount(0);
});

test('skeleton_repeats_the_shell_geometry', async ({ page, api }) => {
  for (const size of [MOBILE, DESKTOP]) {
    await page.setViewportSize(size);
    await toHangingStudents(page, api);
    const skeleton = page.locator(SKELETON);
    await expect(skeleton.locator('[data-slot="skeleton-shell"]'), `${size.width}`).toHaveCount(1);
    const title = skeleton.locator('[data-slot="skeleton-title"]');
    await expect(title, `${size.width}`).toHaveCount(1);
    expect(Math.round((await title.boundingBox())!.height), `${size.width} título`).toBe(30);
    const panels = skeleton.locator('[data-slot="skeleton-panel"]');
    await expect(panels, `${size.width}`).toHaveCount(4);
    for (const box of await panels.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))) {
      expect(Math.round(box), `${size.width} bloco`).toBe(96);
    }
    const avatar = (await skeleton.locator('[data-slot="skeleton-avatar"]').boundingBox())!;
    expect([Math.round(avatar.width), Math.round(avatar.height)], `${size.width} avatar`).toEqual([44, 44]);
    const box = await skeleton.locator('[data-slot="skeleton-content"]').evaluate((element) => {
      const style = getComputedStyle(element);
      return { maxWidth: style.maxWidth, left: style.paddingLeft, right: style.paddingRight, x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width };
    });
    if (size === DESKTOP) {
      const side = skeleton.locator('[data-slot="skeleton-side"]');
      await expect(side).toBeVisible();
      expect(Math.round((await side.boundingBox())!.width)).toBe(256);
      await expect(skeleton.locator('[data-slot="skeleton-bottom-bar"]')).toBeHidden();
    } else {
      await expect(skeleton.locator('[data-slot="skeleton-bottom-bar"]')).toBeVisible();
      await expect(skeleton.locator('[data-slot="skeleton-side"]')).toBeHidden();
    }

    // a tela de verdade, carregada: o `main` tem a mesma largura máxima, os mesmos recuos e a mesma caixa
    api.on('GET', '/api/students', { status: 200, body: { items: [], nextCursor: null } });
    await page.goto('/students');
    await settle(page);
    const main = await page.getByRole('main').evaluate((element) => {
      const style = getComputedStyle(element);
      return { maxWidth: style.maxWidth, left: style.paddingLeft, right: style.paddingRight, x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width };
    });
    expect(box, `${size.width}`).toEqual(main);
  }
});

test('skeleton_pulses_in_1_4s_and_is_static_when_reduced', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await toHangingStudents(page, api);
    const blocks = await page.locator('[data-slot="skeleton"]').evaluateAll((items) =>
      items.map((item) => {
        const style = getComputedStyle(item);
        return { hidden: item.getAttribute('aria-hidden'), name: style.animationName, duration: style.animationDuration, opacity: style.opacity };
      }),
    );
    expect(blocks.length).toBeGreaterThan(5);
    for (const block of blocks) {
      expect(block.hidden).toBe('true');
      if (reduced) expect(block).toMatchObject({ name: 'none', opacity: '0.5' });
      else expect(block).toMatchObject({ name: 'skeleton-pulse', duration: '1.4s' });
    }
  }
});

test('load_error_alert_animates_in_180ms', async ({ page, api }) => {
  serveWorld(api, 'admin');
  api.on('GET', '/api/students', problem(500, 'internal_error'));
  await page.goto('/students');
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toBeVisible();
  expect(await animationOf(alert)).toEqual({ name: 'feedback-in', duration: '0.18s' });
});

test('landing_and_login_have_no_skeleton_or_page_motion', async ({ page, api }) => {
  for (const path of ['/', '/login']) {
    await page.goto(path);
    await settle(page);
    await expect(page.locator(SKELETON), path).toHaveCount(0);
    await expect(page.locator('[data-motion="page"]'), path).toHaveCount(0);
  }
  // com a API presa, o login fica sem resposta e sem esqueleto
  api.on('GET', '/api/auth/session', 'hang');
  await page.goto('/login', { waitUntil: 'commit' }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await expect(page.locator(SKELETON)).toHaveCount(0);
});

// S4 - ações

const REGISTER = 'Registrar presença';

/** Abre `/check-in` com o cartão de um aluno liberado, pronto para registrar a presença. */
async function openCheckInCard(page: Page, api: FakeApi) {
  const status = statusOf(listItemOf(1).id);
  const item = listItemOf(1, { id: status.student.id, name: status.student.name });
  serveSearch(api, 'reception', [item]);
  servePhotos(api, [item.photoUrl, status.photoUrl]);
  api.on('GET', statusPath(status.student.id), { status: 200, body: status });
  await page.goto('/check-in');
  const field = page.getByLabel('Nome ou CPF', { exact: true });
  await field.fill('529.982.247-25');
  await field.press('Enter');
  await expect(page.getByRole('button', { name: REGISTER, exact: true })).toBeVisible();
  return status;
}

/** O `transform` computado do botão com o mouse segurado sobre ele por 250 ms. */
async function heldTransform(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  const transform = await button.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.up();
  return transform;
}

test('button_presses_to_0_98_in_150ms_and_not_when_reduced', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  await page.goto('/students');
  await settle(page);
  const button = page.getByRole('button', { name: 'Filtrar', exact: true });
  const transition = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { property: style.transitionProperty, duration: style.transitionDuration };
  });
  const properties = transition.property.split(', ');
  expect(properties).toContain('transform');
  expect(transition.duration.split(', ')[properties.indexOf('transform')]).toBe('0.15s');
  expect(await heldTransform(page, 'Filtrar')).toBe('matrix(0.98, 0, 0, 0.98, 0, 0)');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/students');
  await settle(page);
  expect(await heldTransform(page, 'Filtrar')).toBe('none');
});

test('busy_button_has_aria_busy_spinner_and_stays_disabled', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  const status = await openCheckInCard(page, api);
  // o pedido de registro fica preso no navegador até o teste soltar
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**${checkInsPath(status.student.id)}`, async (route) => {
    await held;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '018f0000-0000-7000-8000-0000000c3001', day: '2026-10-07', checkedInAt: LATE }) });
  });
  const button = page.getByRole('button', { name: REGISTER, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toBeDisabled();
  const spinner = button.locator('svg');
  await expect(spinner).toHaveCount(1);
  await expect(spinner).toHaveAttribute('aria-hidden', 'true');
  // a caixa do `svg`, não a do retângulo girado que `boundingBox` mede no meio da volta
  expect(await spinner.evaluate((element) => [getComputedStyle(element).width, getComputedStyle(element).height])).toEqual(['16px', '16px']);

  release();
  await expect(page.getByText(/^Presença registrada às/)).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});

test('dialog_opens_with_overlay_150ms_and_content_200ms', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto(`/students/${STUDENT_ID}`);
  await settle(page);
  await page.getByRole('button', { name: 'Inativar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await animationOf(page.locator('[data-slot="dialog-overlay"]'))).toEqual({ name: 'overlay-in', duration: '0.15s' });
  expect(await animationOf(page.locator('[data-slot="dialog-content"]'))).toEqual({ name: 'dialog-in', duration: '0.2s' });
});

test('dialog_unmounts_at_once_and_returns_focus', async ({ page, api }) => {
  serveWorld(api, 'admin');
  await page.goto(`/students/${STUDENT_ID}`);
  await settle(page);
  const trigger = page.getByRole('main').getByRole('button', { name: 'Inativar', exact: true });
  for (const close of ['Escape', 'Cancelar'] as const) {
    await trigger.click();
    await expect(page.getByRole('dialog'), close).toBeVisible();
    if (close === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
    // no quadro seguinte ao fechar não há diálogo no DOM
    const left = await page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(document.querySelectorAll('[role="dialog"]').length))));
    expect(left, close).toBe(0);
    await expect(trigger, close).toBeFocused();
  }
});

test('success_messages_are_feedback_in_180ms', async ({ page, api }) => {
  const status = statusOf(listItemOf(1).id);
  api.on('POST', checkInsPath(status.student.id), {
    status: 201,
    body: { id: '018f0000-0000-7000-8000-0000000c3001', day: '2026-10-07', checkedInAt: LATE },
  });
  await openCheckInCard(page, api);
  await page.getByRole('button', { name: REGISTER, exact: true }).click();
  const registered = page.getByText(/^Presença registrada às/);
  await expect(registered).toBeVisible();
  await expect(registered).toHaveAttribute('data-motion', 'feedback');
  expect(await animationOf(registered)).toEqual({ name: 'feedback-in', duration: '0.18s' });

  api.session = sessionOf('admin');
  api.on('GET', '/api/privacy-settings', { status: 200, body: { inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 30 } });
  api.on('PUT', '/api/privacy-settings', (request) => ({ status: 200, body: request.body }));
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  const saved = page.getByText('Configurações salvas.', { exact: true });
  await expect(saved).toBeVisible();
  await expect(saved).toHaveAttribute('data-motion', 'feedback');
  expect(await animationOf(saved)).toEqual({ name: 'feedback-in', duration: '0.18s' });

  // a terceira mensagem de sucesso do app: a troca de senha em `/account` (C24, AC 24)
  api.session = sessionOf('reception');
  api.on('PUT', '/api/auth/password', { status: 204 });
  await page.goto('/account');
  await formHydrated(page);
  await page.getByLabel('Senha atual').fill('senha-de-teste-123');
  await page.getByLabel('Nova senha').fill('senha-nova-de-teste-456');
  await page.getByRole('button', { name: 'Trocar senha', exact: true }).click();
  const changed = page.getByText('Senha alterada.', { exact: true });
  await expect(changed).toBeVisible();
  await expect(changed).toHaveAttribute('data-motion', 'feedback');
  expect(await animationOf(changed)).toEqual({ name: 'feedback-in', duration: '0.18s' });
});

test('failed_action_alert_keeps_role_and_text_and_animates', async ({ page, api }) => {
  // o `409` relê o cartão; quando a releitura também falha, o aviso aparece
  const status = await openCheckInCard(page, api);
  api.on('POST', checkInsPath(status.student.id), problem(409, 'already_checked_in'));
  api.on('GET', statusPath(status.student.id), problem(500, 'internal_error'));
  await page.getByRole('button', { name: REGISTER, exact: true }).click();
  let alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toHaveText('Não foi possível carregar o aluno.');
  expect(await animationOf(alert)).toEqual({ name: 'feedback-in', duration: '0.18s' });

  // o registro que falha de vez (`500`)
  await openCheckInCard(page, api);
  api.on('POST', checkInsPath(status.student.id), problem(500, 'internal_error'));
  await page.getByRole('button', { name: REGISTER, exact: true }).click();
  alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toHaveText('Não foi possível registrar a presença.');
  expect(await animationOf(alert)).toEqual({ name: 'feedback-in', duration: '0.18s' });
});

// S5 - entrada de conteúdo

const TWELVE = Array.from({ length: 12 }, (_, index) => index + 1);
const idFor = (group: string, n: number) => `018f0000-0000-7000-8000-0000000${group}${String(n).padStart(3, '0')}`;

/** As 5 listas com 12 itens na API falsa, e o nome de cada item na ordem da resposta. */
function serveTwelve(api: FakeApi) {
  serveWorld(api, 'admin');
  const students = TWELVE.map((n) => listItemOf(n, { photoUrl: null }));
  api.on('GET', '/api/students', { status: 200, body: { items: students, nextCursor: null } });
  const plans = TWELVE.map((n) => planOf({ id: idFor('91', n), name: `Plano ${n}` }));
  servePlans(api, stateOf({ plans }));
  const payments = TWELVE.map((n) => openPaymentOf({ student: { id: idFor('63', n), name: `Pagante ${n}` } }));
  serveOpenPayments(api, 'admin', payments);
  const staff = TWELVE.map((n) => staffOf({ id: idFor('41', n), name: `Funcionário ${n}` }));
  serveStaffAs(api, 'admin', { staff, users: [] });
  const report = TWELVE.map((n) => reportItemOf(n));
  api.on('GET', '/api/check-ins', { status: 200, body: reportOf({ total: 12, items: report }) });
  return {
    students: students.map((item) => item.name),
    plans: plans.map((item) => item.name),
    payments: payments.map((item) => item.student.name),
    staff: staff.map((item) => item.name),
    checkIns: report.map((item) => item.student.name),
  };
}

/** As 5 listas: o caminho, o link que leva a ela e a chave dos nomes da fixture. */
const LISTS = [
  { path: '/students', link: 'Alunos', key: 'students' },
  { path: '/plans', link: 'Planos', key: 'plans' },
  { path: '/payments', link: 'Pagamentos', key: 'payments' },
  { path: '/staff', link: 'Funcionários', key: 'staff' },
  { path: '/check-ins', link: 'Presenças', key: 'checkIns' },
] as const;

/** Aciona o link `name` da navegação: a aba ou a barra lateral se visível, senão pelo menu "Mais". */
async function navigateTo(page: Page, name: string) {
  const direct = page.locator('[data-slot="bottom-nav"], [data-slot="side-nav"]').getByRole('link', { name, exact: true }).filter({ visible: true });
  if ((await direct.count()) > 0) return direct.first().click();
  await page.locator('[data-slot="bottom-nav"]').getByRole('button', { name: 'Mais', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name, exact: true }).click();
}

const ROWS = 'main:not([data-old]) tbody tr > td:first-child';
/** Abaixo de 768 px as listas são cartões (ListOrTable); a entrada visível é a delas. */
const LIST_CARDS = 'main:not([data-old]) [data-slot="panel-rows"] > li';
const visibleRows = (size: { width: number }) => (size.width < 768 ? LIST_CARDS : ROWS);
const CARDS = 'main:not([data-old]) [data-slot="dashboard-grid"] > section';

/** De `from`, navega até `name` e amostra `selector` (todos) desde o quadro em que o `main` novo monta. */
async function sampleEntrance(page: Page, from: string, name: string, selector: string) {
  await page.goto(from);
  await settle(page);
  await page.evaluate(() => document.querySelector('main')?.setAttribute('data-old', ''));
  await startSampling(page, [selector], { all: true, appear: true, ms: 900 });
  await navigateTo(page, name);
  const frames = await framesOf(page);
  expect(frames.length, `${name}: a tela nova montou`).toBeGreaterThan(0);
  await settle(page);
  return frames;
}

/** O instante do primeiro quadro em que cada item aparece (`opacity` > 0), relativo ao item 0. */
function firstShown(frames: Frame[], count: number) {
  const times = Array.from({ length: count }, (_, index) => frames.find((frame) => Number(frame.targets[index]?.opacity ?? 0) > 0)?.t);
  for (const [index, time] of times.entries()) expect(time, `item ${index} aparece`).toBeDefined();
  return times.map((time) => time! - times[0]!);
}

/**
 * De onde cada item parte: o maior `translateY` que ele mostra nos quadros amostrados (a entrada vai
 * da distância até 0). A distância é decidida pelo `useEntrance` de `Enter` (door 4): 8 px, 12 px a
 * partir de 1024 px (AC 7, AC 28; `Reveal`, `StaggerItem` e `StaggerCell`).
 */
function expectStartDistance(frames: Frame[], low: number, high: number, label: string) {
  const count = frames.at(-1)!.targets.length;
  for (let index = 0; index < count; index += 1) {
    const farthest = Math.max(...frames.map((frame) => translateYOf(frame.targets[index]?.transform ?? 'none')));
    expect(farthest, `${label} item ${index} distância`).toBeGreaterThan(low);
    expect(farthest, `${label} item ${index} distância`).toBeLessThanOrEqual(high);
  }
}

test('dashboard_cards_reveal_with_40ms_steps', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  const frames = await sampleEntrance(page, '/students', 'Início', CARDS);
  const count = frames.at(-1)!.targets.length;
  expect(count).toBe(7);
  const times = firstShown(frames, count);
  for (const [index, time] of times.entries()) expect(Math.abs(time - index * 40), `cartão ${index}`).toBeLessThanOrEqual(17);
  for (let index = 0; index < count; index += 1) expect(frames.at(-1)!.targets[index], `cartão ${index}`).toMatchObject({ opacity: '1', transform: 'none' });
  expectStartDistance(frames, 6, 8, '390 cartão');

  // o mesmo `Reveal` a partir de 1024 px parte de 12 px (door 4; a decisão de distância do `Enter`)
  await page.setViewportSize(DESKTOP);
  const desktopFrames = await sampleEntrance(page, '/students', 'Início', CARDS);
  expect(desktopFrames.at(-1)!.targets).toHaveLength(7);
  expectStartDistance(desktopFrames, 10, 12, '1440 cartão');
});

test('lists_stagger_8_items_at_40ms_and_cap_the_rest', async ({ page, api }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(MOBILE);
  serveTwelve(api);
  for (const list of LISTS) {
    const frames = await sampleEntrance(page, '/dashboard', list.link, visibleRows(MOBILE));
    expect(frames.at(-1)!.targets, list.path).toHaveLength(12);
    const times = firstShown(frames, 12);
    for (const [index, time] of times.entries()) {
      if (index < 8) expect(Math.abs(time - index * 40), `${list.path} item ${index}`).toBeLessThanOrEqual(17);
      else expect(time, `${list.path} item ${index}`).toBeLessThanOrEqual(280 + 17);
    }
    // a cascata andou de fato: o item 0 começou escondido
    expect(Number(frames[0]!.targets[0]!.opacity), list.path).toBeLessThan(1);
    expectStartDistance(frames, 6, 8, `${list.path} 390`);
  }

  // a partir de 1024 px o mesmo `StaggerCell` parte de 12 px (door 4; a decisão de distância do `Enter`)
  await page.setViewportSize(DESKTOP);
  for (const list of LISTS) {
    const frames = await sampleEntrance(page, '/dashboard', list.link, ROWS);
    expect(frames.at(-1)!.targets, list.path).toHaveLength(12);
    expectStartDistance(frames, 10, 12, `${list.path} 1440`);
  }
});

test('reduced_motion_lists_are_static', async ({ page, api }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  serveTwelve(api);
  const runs = [
    ...LISTS.map((list) => ({ from: '/dashboard', name: list.link, selector: visibleRows(MOBILE), label: list.path })),
    { from: '/students', name: 'Início', selector: CARDS, label: '/dashboard' },
  ];
  for (const run of runs) {
    const frames = await sampleEntrance(page, run.from, run.name, run.selector);
    expect(frames.at(-1)!.targets.length, run.label).toBeGreaterThan(5);
    for (const frame of frames) {
      for (const target of frame.targets) expect(target, run.label).toMatchObject({ opacity: '1', transform: 'none' });
    }
  }
});

/** O nome do link de cada linha (o aluno, o plano, o funcionário) e o nome acessível de cada linha, na ordem do DOM. */
// locator('a'), não getByRole('link'): abaixo de 768 px a tabela fica escondida atrás dos cartões e
// o papel não aparece na árvore de acessibilidade; a ordem e os nomes afirmados continuam os mesmos.
const rowsOf = async (page: Page) => {
  const rows = page.locator('main tbody tr');
  const result: Array<{ link: string | null; name: string }> = [];
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const link = row.locator('a');
    result.push({ link: (await link.count()) > 0 ? (await link.first().textContent())!.trim() : null, name: await row.evaluate((element) => (element as HTMLElement).innerText) });
  }
  return result;
};

test('entrance_keeps_order_names_and_leaves_table_rows_alone', async ({ page, api }) => {
  test.setTimeout(180_000);
  const names = serveTwelve(api);
  for (const size of [MOBILE, DESKTOP]) {
    await page.setViewportSize(size);
    for (const list of LISTS) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(list.path);
      await settle(page);
      const still = await rowsOf(page);

      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const frames = await sampleEntrance(page, '/dashboard', list.link, 'main:not([data-old]) tbody tr');
      const moving = await rowsOf(page);
      expect(moving.map((row) => row.link), `${size.width} ${list.path} ordem`).toEqual(names[list.key]);
      expect(moving, `${size.width} ${list.path} nomes`).toEqual(still);
      if (size === DESKTOP) {
        expect(frames.at(-1)!.targets, list.path).toHaveLength(12);
        for (const frame of frames) {
          for (const target of frame.targets) expect(target, `${list.path} tr`).toMatchObject({ opacity: '1', transform: 'none' });
        }
      }
    }
  }
});

test('replaced_rows_animate_once_and_same_rows_do_not_restart', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');
  const all = TWELVE.map((n) => listItemOf(n, { photoUrl: null }));
  api.on('GET', '/api/students', (request) => {
    const q = new URLSearchParams(request.query).get('q');
    return { status: 200, body: { items: q ? all.slice(6) : all.slice(0, 6), nextCursor: null } };
  });
  await page.goto('/students');
  await settle(page);
  const field = page.getByLabel('Buscar por nome, CPF ou telefone', { exact: true });
  const rows = 'main tbody tr > td';
  await expect(page.locator('main tbody tr').first()).toContainText('Aluno 1');

  // a busca troca as linhas: a primeira linha nova entra escondida
  await field.fill('Aluno');
  await startSampling(page, ['main tbody tr:first-child > td:first-child'], { ms: 900 });
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
  let frames = await framesOf(page);
  await expect(page.locator('main tbody tr').first()).toContainText('Aluno 7');
  expect(frames.some((frame) => Number(frame.targets[0]?.opacity ?? 1) < 1), 'a primeira linha nova começa escondida').toBe(true);
  await settle(page);

  // a mesma busca de novo devolve as mesmas linhas: nada recomeça
  await startSampling(page, [rows], { all: true, ms: 900 });
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
  frames = await framesOf(page);
  for (const frame of frames) {
    for (const target of frame.targets) expect(Number(target!.opacity), 'mesmas linhas').toBe(1);
  }
});

test('entrance_does_not_widen_the_page_at_360', async ({ page, api }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(NARROW);
  serveTwelve(api);
  for (const list of LISTS) {
    await page.goto('/dashboard');
    await settle(page);
    await page.evaluate(() => {
      const widths: number[][] = [];
      Object.assign(window, { __widths: widths, __done: false });
      const start = performance.now();
      const tick = () => {
        widths.push([document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        if (performance.now() - start < 1500) requestAnimationFrame(tick);
        else Object.assign(window, { __done: true });
      };
      requestAnimationFrame(tick);
    });
    await navigateTo(page, list.link);
    await page.waitForFunction(() => (window as unknown as { __done: boolean }).__done);
    const widths = await page.evaluate(() => (window as unknown as { __widths: number[][] }).__widths);
    expect(widths.length, list.path).toBeGreaterThan(30);
    for (const [scroll, client] of widths) expect(scroll, list.path).toBe(client);
    const edges = await page.locator('main table').evaluate((table) => {
      const scroller = table.parentElement!;
      const panel = scroller.parentElement!.closest('.bg-card') ?? scroller.parentElement!;
      return { scroller: scroller.getBoundingClientRect().right, panel: panel.getBoundingClientRect().right };
    });
    expect(edges.scroller, list.path).toBeLessThanOrEqual(edges.panel);
  }
});

// S6 - movimento reduzido, responsividade e portão

const QUIET = '[data-motion="page"], [data-slot="page-skeleton"], [role="alert"], [role="dialog"], [data-motion="feedback"]';

/** As animações do documento em `QUIET` ou dentro dele, e o `animation-name` de cada elemento de `QUIET`. */
const quietState = (page: Page) =>
  page.evaluate((selector) => {
    const running = document.getAnimations().filter((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      return target instanceof Element && target.closest(selector) !== null;
    });
    const names = [...document.querySelectorAll(selector)].map((element) => getComputedStyle(element).animationName);
    return { running: running.length, names, count: names.length };
  }, QUIET);

test('reduced_motion_leaves_no_running_animation', async ({ page, api }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const expectQuiet = async (label: string) => {
    const state = await quietState(page);
    expect(state.count, `${label}: o elemento existe`).toBeGreaterThan(0);
    expect(state.running, label).toBe(0);
    for (const name of state.names) expect(name, label).toBe('none');
  };

  // navegação
  serveWorld(api, 'admin');
  await toStudents(page);
  await settle(page);
  await expectQuiet('navegação');

  // esqueleto da espera (a rede não para: espera o esqueleto e mais meio segundo)
  await toHangingStudents(page, api);
  await page.waitForTimeout(500);
  await expectQuiet('esqueleto');

  // diálogo
  serveWorld(api, 'admin');
  await page.goto(`/students/${STUDENT_ID}`);
  await settle(page);
  await page.getByRole('button', { name: 'Inativar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await settle(page);
  await expectQuiet('diálogo');
  await page.keyboard.press('Escape');

  // registro que falha
  const status = await openCheckInCard(page, api);
  api.on('POST', checkInsPath(status.student.id), problem(500, 'internal_error'));
  await page.getByRole('button', { name: 'Registrar presença', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await settle(page);
  await expectQuiet('aviso');

  // entrada de lista
  serveTwelve(api);
  await sampleEntrance(page, '/dashboard', 'Alunos', ROWS);
  await expectQuiet('lista');

  // menu da landing
  await page.goto('/');
  await settle(page);
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await expect(page.locator('#site-menu')).toBeVisible();
  await settle(page);
  await expectQuiet('menu da landing');
});

/** Grava `[scrollWidth, clientWidth]` do documento a cada quadro por 1,2 s. */
const recordWidths = () => {
  const widths: number[][] = [];
  Object.assign(window, { __widths: widths, __done: false });
  const start = performance.now();
  const tick = () => {
    if (document.documentElement) widths.push([document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (performance.now() - start < 1200) requestAnimationFrame(tick);
    else Object.assign(window, { __done: true });
  };
  requestAnimationFrame(tick);
};

/** As larguras do documento a cada quadro, da ação até a tela assentar. */
async function widthsDuring(page: Page, action: () => Promise<unknown>) {
  await page.evaluate(recordWidths);
  await action();
  await page.waitForFunction(() => (window as unknown as { __done: boolean }).__done);
  return page.evaluate(() => (window as unknown as { __widths: number[][] }).__widths);
}

test('no_horizontal_scroll_during_motion_at_360_and_1440', async ({ page, api }) => {
  test.setTimeout(120_000);
  serveTwelve(api);
  for (const size of [NARROW, DESKTOP]) {
    await page.setViewportSize(size);
    // `/`: o primeiro documento, desde o primeiro quadro dele, e o cabeçalho que ganha fundo
    // (numa página só dela: o script de início valeria para toda navegação seguinte da página)
    const landing = await page.context().newPage();
    await landing.setViewportSize(size);
    await landing.addInitScript(recordWidths);
    await landing.goto('/');
    await landing.evaluate(() => window.scrollTo(0, 400));
    await landing.waitForFunction(() => (window as unknown as { __done: boolean }).__done);
    let widths = await landing.evaluate(() => (window as unknown as { __widths: number[][] }).__widths);
    await landing.close();
    expect(widths.length, `${size.width} /`).toBeGreaterThan(30);
    for (const [scroll, client] of widths) expect(scroll, `${size.width} /`).toBe(client);
    // as telas internas por navegação: a transição e a cascata rodando
    for (const [from, name, path] of [
      ['/students', 'Início', '/dashboard'],
      ['/dashboard', 'Alunos', '/students'],
      ['/dashboard', 'Funcionários', '/staff'],
    ] as const) {
      await page.goto(from);
      await settle(page);
      widths = await widthsDuring(page, () => navigateTo(page, name));
      await expect(page).toHaveURL(path);
      expect(widths.length, `${size.width} ${path}`).toBeGreaterThan(30);
      for (const [scroll, client] of widths) expect(scroll, `${size.width} ${path}`).toBe(client);
    }
  }
});

test('motion_raises_no_csp_violation', async ({ page, api }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (event) => violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  const violations = () => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
  await page.setViewportSize(MOBILE);
  serveWorld(api, 'admin');

  // navegação com a transição de página e a abertura de um diálogo, no mesmo documento
  await toStudents(page);
  await settle(page);
  await page.goto(`/students/${STUDENT_ID}`);
  await settle(page);
  await page.getByRole('button', { name: 'Inativar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await navigateTo(page, 'Início');
  await expect(page).toHaveURL('/dashboard');
  await settle(page);
  expect(await violations()).toEqual([]);

  // o menu da landing
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await expect(page.locator('#site-menu')).toBeVisible();
  await settle(page);
  await page.keyboard.press('Escape');
  expect(await violations()).toEqual([]);
});

// S6 - C39: cópia, nomes acessíveis e ordem de foco iguais ao baseline gravado em `7471232`

const BASELINE_DIR = join(import.meta.dirname, 'fixtures', 'motion-baseline');
const fileOf = (size: { width: number }) => join(BASELINE_DIR, `${size.width}.json`);

test('copy_names_and_focus_order_match_the_baseline', async ({ page, api }) => {
  test.setTimeout(600_000);
  // `MOTION_BASELINE=record` grava o baseline; só se roda assim sobre o código de `7471232`
  const record = process.env.MOTION_BASELINE === 'record';
  // os contadores de id como estavam quando o baseline foi gravado, com esta prova rodando sozinha
  fixtureIds.set({ expiring: 0, enrollments: 1, periods: 1, confirmations: 0, openIds: 0 });
  expect(SHELL_PATHS).toHaveLength(22);

  for (const size of [MOBILE, DESKTOP]) {
    await page.setViewportSize(size);
    const seen: Record<string, Baseline> = {};
    for (const path of ['/', ...SHELL_PATHS]) {
      if (path === '/') api.session = undefined;
      else serveWorld(api, 'admin');
      await page.goto(path);
      await expect(page.getByRole('main'), path).toBeVisible();
      await settle(page);
      seen[path] = await baselineOf(page, path === '/');
    }
    if (record) {
      mkdirSync(BASELINE_DIR, { recursive: true });
      writeFileSync(fileOf(size), `${JSON.stringify(seen, null, 2)}\n`);
      continue;
    }
    const baseline = JSON.parse(readFileSync(fileOf(size), 'utf8')) as Record<string, Baseline>;
    expect(Object.keys(seen), `${size.width}`).toEqual(Object.keys(baseline));
    for (const [path, expected] of Object.entries(baseline)) {
      expect(seen[path]!.text, `${size.width} ${path} texto`).toBe(expected.text);
      expect(seen[path]!.aria, `${size.width} ${path} ARIA`).toBe(expected.aria);
      expect(seen[path]!.focus, `${size.width} ${path} foco`).toEqual(expected.focus);
    }
  }
});
