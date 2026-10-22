import type { Page } from '@playwright/test';
import { expect, sessionOf, test } from './support/fake-api.ts';
import { DESKTOP, framesOf, MOBILE, NARROW, settle, startSampling } from './support/motion.ts';
import { styleOf } from './support/identidade.ts';
import { SITE } from '../src/app/site-content.ts';

/**
 * A prova do cabeçalho flutuante e do menu do celular da landing (`motion`, S7; door 7): medidos num
 * Chromium real sobre o build de produção, em toda largura da referência.
 */

const WIDTHS = [
  { width: 360, height: 844 },
  { width: 390, height: 844 },
  { width: 768, height: 844 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
];

const header = (page: Page) => page.locator('[data-slot="site-header"]');
const menuButton = (page: Page) => page.getByRole('button', { name: SITE.menu.open, exact: true });
const menu = (page: Page) => page.locator('#site-menu');
const desktopNav = (page: Page) => header(page).getByRole('navigation', { name: SITE.labels.nav, exact: true });
const NAV_HREFS = SITE.nav.map((item) => item.href);

/** Rola a página até `y` e espera o quadro seguinte. */
async function scrollToY(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** Espera a rolagem parar: duas leituras de `scrollY` iguais com 100 ms de intervalo. */
async function scrollSettled(page: Page) {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const before = window.scrollY;
        setTimeout(() => resolve(window.scrollY === before), 100);
      }),
  );
}

test('header_stays_in_the_top_88px_at_every_scroll_and_width', async ({ page }) => {
  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    await page.goto('/');
    const bottom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    for (const y of [0, Math.round(bottom / 2), bottom]) {
      await scrollToY(page, y);
      const label = `${size.width} y=${y}`;
      await expect(header(page), label).toBeVisible();
      const box = (await header(page).boundingBox())!;
      expect(box.y, label).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, label).toBeLessThanOrEqual(88);
      expect(Math.round(box.height), label).toBe(64);
      expect((await styleOf(header(page), 'position')).raw, label).toBe('fixed');
      expect((await styleOf(header(page), 'top')).raw, label).toBe('12px');
      expect((await styleOf(header(page), 'z-index')).raw, label).toBe('40');
      const inset = size.width >= 1024 ? 32 : 16;
      expect(Math.round(box.x), label).toBe(inset);
      expect(Math.round(size.width - (box.x + box.width)), label).toBe(inset);
    }
  }
});

test('header_is_the_only_banner_before_main_outside_the_hero', async ({ page }) => {
  for (const size of [MOBILE, DESKTOP]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const banner = page.getByRole('banner');
    await expect(banner, `${size.width}`).toHaveCount(1);
    expect(
      await banner.evaluate((element) => ({
        tag: element.tagName.toLowerCase(),
        slot: element.getAttribute('data-slot'),
        next: element.nextElementSibling?.tagName.toLowerCase(),
      })),
      `${size.width}`,
    ).toEqual({ tag: 'header', slot: 'site-header', next: 'main' });
    const hero = page.locator('[data-slot="hero"]');
    await expect(hero.locator('header'), `${size.width}`).toHaveCount(0);
    await expect(hero.locator('[data-slot="site-header"]'), `${size.width}`).toHaveCount(0);
  }
});

test('header_turns_solid_after_24px_in_200ms', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  for (const y of [0, 23]) {
    await scrollToY(page, y);
    await expect(header(page), `y=${y}`).not.toHaveAttribute('data-scrolled');
    await page.waitForTimeout(250);
    expect(await header(page).evaluate((element) => getComputedStyle(element).backgroundColor), `y=${y}`).toBe('rgba(0, 0, 0, 0)');
  }
  for (const y of [25, 400]) {
    await scrollToY(page, y);
    await expect(header(page), `y=${y}`).toHaveAttribute('data-scrolled');
    await page.waitForTimeout(250);
    const style = await header(page).evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        blur: computed.backdropFilter,
        property: computed.transitionProperty.split(', '),
        duration: computed.transitionDuration.split(', '),
      };
    });
    expect(style.background, `y=${y}`).toBe('rgba(0, 0, 0, 0.72)');
    expect(style.blur, `y=${y}`).toBe('blur(12px)');
    for (const property of ['background-color', 'border-color']) {
      const index = style.property.indexOf(property);
      expect(index, `${property} y=${y}`).toBeGreaterThan(-1);
      expect(style.duration[index] ?? style.duration[0], `${property} y=${y}`).toBe('0.2s');
    }
  }
});

test('desktop_header_has_logo_nav_and_session_cta', async ({ page, api }) => {
  for (const size of [{ width: 1024, height: 800 }, DESKTOP]) {
    await page.setViewportSize(size);
    for (const signedIn of [false, true]) {
      api.session = signedIn ? sessionOf('admin') : undefined;
      await page.goto('/');
      const label = `${size.width} ${signedIn ? 'com sessão' : 'sem sessão'}`;
      await expect(header(page).getByRole('img', { name: SITE.logo.alt, exact: true }), label).toBeVisible();
      await expect(desktopNav(page), label).toBeVisible();
      const links = desktopNav(page).getByRole('link');
      expect(await links.allTextContents(), label).toEqual(SITE.nav.map((item) => item.label));
      expect(await links.evaluateAll((items) => items.map((item) => item.getAttribute('href'))), label).toEqual(NAV_HREFS);
      const cta = header(page).getByRole('link', { name: signedIn ? 'Ir para o painel' : 'Acesso da equipe', exact: true });
      await expect(cta, label).toBeVisible();
      await expect(cta, label).toHaveAttribute('href', signedIn ? '/dashboard' : '/login');
      await expect(menuButton(page), label).toBeHidden();
    }
  }
});

test('mobile_header_has_logo_cta_and_menu_button', async ({ page }) => {
  for (const size of [NARROW, MOBILE, { width: 768, height: 1024 }, { width: 1023, height: 800 }]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const label = `${size.width}`;
    await expect(header(page).getByRole('img', { name: SITE.logo.alt, exact: true }), label).toBeVisible();
    await expect(header(page).getByRole('link', { name: 'Acesso da equipe', exact: true }), label).toBeVisible();
    const button = menuButton(page);
    await expect(button, label).toBeVisible();
    const box = (await button.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)], label).toEqual([44, 44]);
    await expect(button, label).toHaveAttribute('aria-expanded', 'false');
    await expect(button, label).toHaveAttribute('aria-controls', 'site-menu');
    await expect(desktopNav(page), label).toBeHidden();
  }
});

test('menu_opens_full_screen_with_focus_links_and_ctas', async ({ page, api }) => {
  await page.setViewportSize(MOBILE);
  for (const signedIn of [false, true]) {
    api.session = signedIn ? sessionOf('admin') : undefined;
    await page.goto('/');
    await menuButton(page).click();
    const dialog = page.getByRole('dialog', { name: SITE.menu.title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('id', 'site-menu');
    // a caixa depois da entrada: no meio do `dialog-in` o painel ainda está em `scale(0.98)`
    await settle(page);
    const box = (await dialog.boundingBox())!;
    expect([box.x, box.y, box.width, box.height].map(Math.round)).toEqual([0, 0, 390, 844]);
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    // com o menu aberto o Radix esconde o resto da página do leitor de tela: o botão se acha pelo atributo
    await expect(header(page).locator('button[aria-controls="site-menu"]')).toHaveAttribute('aria-expanded', 'true');
    const sections = dialog.getByRole('navigation', { name: SITE.labels.nav, exact: true }).getByRole('link');
    expect(await sections.allTextContents()).toEqual(SITE.nav.map((item) => item.label));
    for (const style of await sections.evaluateAll((links) => links.map((link) => [getComputedStyle(link).fontSize, getComputedStyle(link).textTransform]))) {
      expect(style).toEqual(['36px', 'uppercase']);
    }
    await expect(dialog.getByRole('link', { name: SITE.cta.join, exact: true })).toHaveAttribute('href', '#planos');
    await expect(dialog.getByRole('link', { name: signedIn ? 'Ir para o painel' : 'Acesso da equipe', exact: true })).toHaveAttribute(
      'href',
      signedIn ? '/dashboard' : '/login',
    );
    await expect(dialog.getByRole('link', { name: SITE.instagram.handle })).toHaveAttribute('href', SITE.instagram.url);
  }
});

test('menu_animates_overlay_panel_and_stagger_and_not_when_reduced', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await settle(page);
  // os links animam o `li` em volta deles: a opacidade lida é a do item
  await startSampling(page, ['#site-menu nav li'], { all: true, appear: true });
  await menuButton(page).click();
  const items = await framesOf(page);
  expect(await page.locator('[data-slot="dialog-overlay"]').evaluate((element) => [getComputedStyle(element).animationName, getComputedStyle(element).animationDuration])).toEqual(['overlay-in', '0.15s']);
  expect(await menu(page).evaluate((element) => [getComputedStyle(element).animationName, getComputedStyle(element).animationDuration])).toEqual(['dialog-in', '0.2s']);
  const times = Array.from({ length: 5 }, (_, index) => items.find((frame) => Number(frame.targets[index]?.opacity ?? 0) > 0)?.t);
  for (const time of times) expect(time).toBeDefined();
  for (const [index, time] of times.entries()) expect(Math.abs(time! - times[0]! - index * 40), `link ${index}`).toBeLessThanOrEqual(17);
  expect(Number(items[0]!.targets[0]!.opacity)).toBeLessThan(1);
  await page.keyboard.press('Escape');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await settle(page);
  await startSampling(page, ['#site-menu nav li'], { all: true, appear: true });
  await menuButton(page).click();
  const still = await framesOf(page);
  expect(await page.locator('[data-slot="dialog-overlay"]').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  expect(await menu(page).evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  expect(still.length).toBeGreaterThan(20);
  for (const frame of still) {
    expect(frame.targets).toHaveLength(5);
    for (const target of frame.targets) expect(target).toMatchObject({ opacity: '1', transform: 'none' });
  }
});

test('menu_link_closes_and_shows_the_eyebrow_below_the_header', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  for (const item of SITE.nav) {
    await page.goto('/');
    await page.locator('#planos').evaluate((element) => element.scrollIntoView());
    await scrollSettled(page);
    await menuButton(page).click();
    await menu(page).getByRole('link', { name: item.label, exact: true }).click();
    await expect(menu(page), item.label).toHaveCount(0);
    await scrollSettled(page);
    const eyebrow = page.locator(`${item.href}-eyebrow`);
    const top = (await eyebrow.boundingBox())!.y;
    const headerBottom = await header(page).evaluate((element) => element.getBoundingClientRect().bottom);
    expect(top, item.label).toBeGreaterThanOrEqual(headerBottom);
    expect(top, item.label).toBeLessThan(MOBILE.height);
  }
});

test('escape_and_close_return_focus_to_the_menu_button', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  for (const close of ['Escape', SITE.menu.close] as const) {
    await menuButton(page).click();
    await expect(menu(page), close).toBeVisible();
    if (close === 'Escape') await page.keyboard.press('Escape');
    else await menu(page).getByRole('button', { name: SITE.menu.close, exact: true }).click();
    const left = await page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(document.querySelectorAll('#site-menu').length))));
    expect(left, close).toBe(0);
    await expect(menuButton(page), close).toBeFocused();
  }
});

test('desktop_link_stops_the_section_below_the_header', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  for (const item of SITE.nav) {
    await page.goto('/');
    await desktopNav(page).getByRole('link', { name: item.label, exact: true }).click();
    await scrollSettled(page);
    const top = await page.locator(item.href).evaluate((element) => element.getBoundingClientRect().top);
    const headerBottom = await header(page).evaluate((element) => element.getBoundingClientRect().bottom);
    expect(top, item.label).toBeGreaterThanOrEqual(headerBottom);
  }
});

test('current_section_link_has_aria_current_location', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  for (const item of SITE.nav) {
    await page.locator(item.href).evaluate((element) => element.scrollIntoView());
    await scrollSettled(page);
    const current = desktopNav(page).locator('[aria-current="location"]');
    await expect(current, item.label).toHaveCount(1);
    await expect(current, item.label).toHaveAttribute('href', item.href);
  }
});

test('header_does_not_widen_or_cover_the_hero_title', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto('/');
  const widths = () => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  let [scroll, client] = await widths();
  expect(scroll).toBe(client);
  await menuButton(page).click();
  await expect(menu(page)).toBeVisible();
  [scroll, client] = await widths();
  expect(scroll).toBe(client);
  await page.keyboard.press('Escape');

  for (const size of [MOBILE, DESKTOP]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
    const box = (await header(page).boundingBox())!;
    const overlaps = title.x < box.x + box.width && box.x < title.x + title.width && title.y < box.y + box.height && box.y < title.y + title.height;
    expect(overlaps, `${size.width}`).toBe(false);
  }
});

test('landing_menu_keeps_csp_same_origin_and_no_page_motion', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (event) => violations.push(event.violatedDirective));
  });
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await scrollToY(page, 400);
  await expect(header(page)).toHaveAttribute('data-scrolled');
  await menuButton(page).click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await settle(page);

  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
  expect([...origins]).toEqual([new URL(baseURL!).origin]);
  await expect(page.locator('[data-motion="page"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="page-skeleton"]')).toHaveCount(0);
});
