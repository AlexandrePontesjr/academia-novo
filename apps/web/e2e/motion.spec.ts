import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type FakeApi, problem, test } from './support/fake-api.ts';
import { SCREENS, serveWorld } from './support/identidade.ts';
import type { Page } from '@playwright/test';
import { animationOf, type Baseline, baselineOf, DESKTOP, framesOf, MOBILE, settle, startSampling, translateYOf } from './support/motion.ts';
import { STUDENT_ID } from './support/plans.ts';
import { STAFF_ID } from './support/staff.ts';

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
  // fora o que o Next põe no `body` (scripts, o anunciador de rota e o `<div hidden>` dos metadados),
  // o único filho é a raiz da Shell: o provider não acrescenta elemento entre ela e o `body`
  const children = await page.evaluate(() =>
    [...document.body.children]
      .filter((element) => !['SCRIPT', 'NEXT-ROUTE-ANNOUNCER'].includes(element.tagName))
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
  expect(routes).toHaveLength(19);
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

// S6 - C39: cópia, nomes acessíveis e ordem de foco iguais ao baseline gravado em `7471232`

const BASELINE_DIR = join(import.meta.dirname, 'fixtures', 'motion-baseline');
const fileOf = (size: { width: number }) => join(BASELINE_DIR, `${size.width}.json`);

test('copy_names_and_focus_order_match_the_baseline', async ({ page, api }) => {
  test.setTimeout(600_000);
  // `MOTION_BASELINE=record` grava o baseline; só se roda assim sobre o código de `7471232`
  const record = process.env.MOTION_BASELINE === 'record';
  expect(SHELL_PATHS).toHaveLength(21);

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
