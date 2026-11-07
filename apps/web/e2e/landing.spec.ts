import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fake-api.ts';
import { DESKTOP, MOBILE, framesOf, settle, startSampling } from './support/motion.ts';
import { styleOf } from './support/identidade.ts';
import { SITE } from '../src/app/site-content.ts';

/**
 * A prova do refino visual, S2 (`.specs/features/refino-visual`): a landing como um lugar da DukFit em
 * Flores, Manaus, medida num Chromium real sobre o build de produção.
 */

const LIME = 'rgb(252, 244, 60)';
const INK = 'rgb(0, 0, 0)';
const BORDER = 'rgb(38, 38, 38)';
const NARROW = { width: 320, height: 800 };
const HERO_TITLE = 'Musculação e cardio em Flores, Manaus';
const HERO_SUBLINE = 'Treine todos os dias, das 06:00 às 22:00, com acompanhamento de perto.';
const SECTION_IDS = ['visita', 'academia', 'estrutura', 'planos', 'fecho'];

/** A escala de um `transform` computado (`none` é 1; o Chromium serializa em `matrix`). */
function scaleOf(transform: string) {
  if (transform === 'none' || transform === '') return 1;
  const values = /matrix(?:3d)?\(([^)]+)\)/.exec(transform)?.[1]?.split(',').map(Number) ?? [];
  if (transform.startsWith('matrix3d')) return values[0]!;
  return values[0]!;
}

/** A rolagem horizontal do documento: `[scrollWidth, clientWidth]`. */
const widthsOf = (page: Page) =>
  page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);

// C14 - o documento é um lugar: `data-type` no `<html>` e as três metas da página
test('landing_declares_place_type_and_page_metas', async ({ page, api }) => {
  expect(api.session).toBeUndefined();
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(response?.request().redirectedFrom()).toBeNull();

  await expect(page.locator('html')).toHaveAttribute('data-type', 'place');
  for (const [name, content] of [
    ['page-type', 'place'],
    ['site-kind', 'other'],
    ['page-kind', 'place'],
  ] as const) {
    await expect(page.locator(`meta[name="${name}"]`), name).toHaveAttribute('content', content);
  }
});

// C15 - o `h1` diz o que é e onde fica, e a sub-linha diz o horário; os dois vêm de `SITE.hero`
test('hero_states_what_where_and_the_hours', async ({ page }) => {
  expect(SITE.hero.title).toBe(HERO_TITLE);
  expect(SITE.hero.subline).toBe(HERO_SUBLINE);

  await page.goto('/');
  const hero = page.locator('[data-slot="hero"]');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText(HERO_TITLE);
  await expect(hero.locator('[data-slot="hero-subline"]')).toHaveText(HERO_SUBLINE);
});

// C16 - a 1440×900 o herói ocupa a primeira tela e o `h2` seguinte começa abaixo dela
test('hero_fills_the_first_screen_and_the_next_h2_starts_below_it', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  const hero = (await page.locator('[data-slot="hero"]').boundingBox())!;
  expect(hero.y).toBe(0);
  expect(hero.height).toBeGreaterThanOrEqual(900);
  const nextHeadline = (await page.locator('#visita h2').boundingBox())!;
  expect(nextHeadline.y).toBeGreaterThan(900);
});

// C17 - a ordem literal da door 2, com `scroll-mt-24` em toda seção menos o herói e o footer
test('sections_follow_the_door_two_order', async ({ page }) => {
  await page.goto('/');
  expect(Object.keys(SITE.sections)).toEqual(['visit', 'about', 'structure', 'plans', 'closing']);
  const ids = await page.locator('main > section').evaluateAll((sections) => sections.map((section) => section.id || null));
  expect(ids).toEqual([null, ...SECTION_IDS]);
  await expect(page.locator('main > section').first()).toHaveAttribute('data-slot', 'hero');

  for (const id of SECTION_IDS) {
    const margin = await styleOf(page.locator(`#${id}`), 'scroll-margin-top');
    expect(margin.raw, id).toBe('96px');
  }
  for (const scope of ['[data-slot="hero"]', 'footer']) {
    expect((await styleOf(page.locator(scope), 'scroll-margin-top')).raw, scope).toBe('0px');
  }

  const footerAfterMain = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const footer = document.querySelector('footer')!;
    return Boolean(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(footerAfterMain).toBe(true);
});

// C18 - cada seção tem de uma a duas telas, e o footer é curto
test('each_section_is_one_to_two_screens_and_the_footer_is_short', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  const heights = await page.locator('main > section').evaluateAll((sections) => sections.map((section) => section.getBoundingClientRect().height));
  expect(heights).toHaveLength(6);
  for (const [index, height] of heights.entries()) {
    expect(height, `seção ${index}`).toBeGreaterThanOrEqual(900);
    expect(height, `seção ${index}`).toBeLessThanOrEqual(1800);
  }
  const footer = (await page.locator('footer').boundingBox())!;
  expect(footer.height).toBeLessThanOrEqual(900);
});

// C19 - a visita é a segunda seção, com o endereço grande, o horário e as três rotas
test('visit_is_the_second_section_with_large_address_hours_and_routes', async ({ page }) => {
  await page.goto('/');
  const sections = page.locator('main > section');
  await expect(sections.nth(1)).toHaveAttribute('id', 'visita');

  const address = sections.nth(1).locator('[data-slot="visit-address"]');
  await expect(address).toHaveAttribute('href', SITE.routes.google);
  await expect(address).toContainText(SITE.address.street);
  await expect(address).toContainText(SITE.address.district);
  expect(Number.parseFloat((await styleOf(address, 'font-size')).raw)).toBeGreaterThanOrEqual(48);

  await expect(sections.nth(1).locator('[data-slot="visit-hours"]')).toHaveText('Todos os dias, 06:00–22:00');

  const routes = sections.nth(1).locator('[data-slot="route-link"]');
  await expect(routes).toHaveCount(3);
  const expected = [
    ['Google Maps', SITE.routes.google],
    ['Waze', SITE.routes.waze],
    ['Uber', SITE.routes.uber],
  ] as const;
  for (const [index, [name, href]] of expected.entries()) {
    const link = routes.nth(index);
    await expect(link).toHaveText(name);
    await expect(link).toHaveAttribute('href', href);
    expect((await link.boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
  }
});

// C20 - quatro fotografias distintas, cada uma uma vez, e nenhuma onde o plano pede tipo
test('four_photographs_each_once_and_none_in_visit_plans_or_close', async ({ page }) => {
  await page.goto('/');
  const expected = [
    [SITE.hero.src, SITE.hero.alt],
    [SITE.about.photo.src, SITE.about.photo.alt],
    [SITE.structure.photos[0]!.src, SITE.structure.photos[0]!.alt],
    [SITE.structure.photos[1]!.src, SITE.structure.photos[1]!.alt],
  ] as const;
  expect(new Set(expected.map(([src]) => src)).size).toBe(4);

  const photos = page.locator('img[data-slot="photo"]');
  await expect(photos).toHaveCount(4);
  const sources = await photos.evaluateAll((images) => images.map((image) => new URL(image.getAttribute('src')!, 'http://x').pathname));
  expect(sources).toEqual(expected.map(([src]) => src));
  expect(new Set(sources).size).toBe(4);

  const sourcesIn = (scope: string) =>
    page.locator(`${scope} img[data-slot="photo"]`).evaluateAll((images) => images.map((image) => new URL(image.getAttribute('src')!, 'http://x').pathname));
  expect(await sourcesIn('[data-slot="hero"]')).toEqual([SITE.hero.src]);
  expect(await sourcesIn('#academia')).toEqual([SITE.about.photo.src]);
  expect(await sourcesIn('#estrutura')).toEqual([SITE.structure.photos[0]!.src, SITE.structure.photos[1]!.src]);
  for (const scope of ['#visita', '#planos', '#fecho']) await expect(page.locator(`${scope} img`), scope).toHaveCount(0);
});

// C21 - sem legenda em foto, todo `img` medido e descrito, e a prioridade de carregamento certa
test('photographs_have_no_caption_and_load_by_priority', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('figcaption')).toHaveCount(0);
  for (const figure of await page.locator('main figure').all()) expect((await figure.innerText()).trim(), 'legenda').toBe('');

  for (const image of await page.locator('img').all()) {
    expect(await image.getAttribute('width'), 'width').toBeTruthy();
    expect(await image.getAttribute('height'), 'height').toBeTruthy();
    expect((await image.getAttribute('alt'))?.trim(), 'alt').toBeTruthy();
  }

  const hero = page.locator('[data-photo="hero"]');
  await expect(hero).toHaveAttribute('fetchpriority', 'high');
  expect(await hero.getAttribute('loading')).toBeNull();
  for (const photo of await page.locator('img[data-slot="photo"]').all()) {
    if ((await photo.getAttribute('data-photo')) === 'hero') continue;
    expect(await photo.getAttribute('loading')).toBe('lazy');
  }
});

// C22 - a linguagem da página de lugar: foto reta, chão plano e réguas de 1 px da borda do tema
test('place_language_has_square_photos_flat_ground_and_hairlines', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  const radiusIn = (selector: string) =>
    page.locator(selector).evaluateAll((elements) => elements.map((element) => getComputedStyle(element).borderTopLeftRadius));
  for (const selector of ['[data-slot="photo"]', '[data-slot="photo-frame"]', '[data-slot="structure-photo"]']) {
    for (const radius of await radiusIn(selector)) expect(radius, selector).toBe('0px');
  }
  for (const radius of await radiusIn('[data-slot="visit-address"]')) expect(radius).toBe('0px');

  const ground = await page.evaluate(() => {
    const elements = [document.querySelector('main')!, ...document.querySelectorAll('main > section')];
    return elements.map((element) => getComputedStyle(element).backgroundImage);
  });
  for (const image of ground) expect(image).toBe('none');

  const shadows = await page.locator('main *').evaluateAll((elements) =>
    elements.filter((element) => getComputedStyle(element).boxShadow !== 'none').map((element) => element.tagName.toLowerCase()),
  );
  expect(shadows).toEqual([]);

  // cartão arredondado: só o pill dos botões/link arredonda; nenhum bloco de conteúdo
  const rounded = await page.locator('main *').evaluateAll((elements) =>
    elements
      .filter((element) => getComputedStyle(element).borderTopLeftRadius !== '0px')
      .filter((element) => !(element.matches('a, button') || element.closest('a, button') !== null))
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
  );
  expect(rounded).toEqual([]);

  const hairlines = await page.locator('main *').evaluateAll((elements) =>
    elements
      .filter((element) => getComputedStyle(element).borderTopWidth === '1px')
      .map((element) => [getComputedStyle(element).borderTopColor, getComputedStyle(element).borderTopLeftRadius]),
  );
  expect(hairlines.length).toBeGreaterThan(6);
  for (const [color, radius] of hairlines) {
    expect(color).toBe(BORDER);
    expect(radius).toBe('0px');
  }
});

// C23 - nada na landing anima em laço
test('nothing_loops_on_the_landing', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await expect(page.locator('[data-slot="carousel"], [data-slot="gallery"], [data-slot="about-badge"], video[autoplay]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /foto anterior|próxima foto/i })).toHaveCount(0);

  const running = await page.evaluate(async () => {
    const samples: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      samples.push(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations === Infinity).length);
    }
    return samples;
  });
  expect(running).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
});

// C24 - o ponteiro responde na foto linkada, no título linkado e no botão
test('hover_and_press_answer_on_photos_titles_and_buttons', async ({ page }) => {
  await page.goto('/');
  await settle(page);

  const photoLink = page.locator('[data-slot="photo-link"]');
  const photo = photoLink.locator('img[data-slot="photo"]');
  await photoLink.scrollIntoViewIfNeeded();
  expect(await photo.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  await photoLink.hover();
  await expect.poll(async () => scaleOf(await photo.evaluate((element) => getComputedStyle(element).transform))).toBeCloseTo(1.03, 2);
  // a moldura não cresce: a foto cresce dentro dela
  expect(await photoLink.evaluate((element) => getComputedStyle(element).transform)).toBe('none');

  const titleLink = page.locator('[data-slot="plan-title"]');
  await titleLink.scrollIntoViewIfNeeded();
  const underline = () => titleLink.evaluate((element) => getComputedStyle(element, '::after').transform);
  expect(scaleOf(await underline())).toBeCloseTo(0, 2);
  await titleLink.hover();
  await expect.poll(async () => scaleOf(await underline())).toBeCloseTo(1, 2);

  const button = page.locator('[data-slot="hero-cta"]');
  await button.scrollIntoViewIfNeeded();
  const rest = (await button.boundingBox())!;
  await button.hover();
  await expect.poll(async () => Math.round((await button.boundingBox())!.y), { timeout: 2_000 }).toBe(Math.round(rest.y) - 1);
  const center = (await button.boundingBox())!;
  await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  expect(await button.evaluate((element) => getComputedStyle(element).transform)).toBe('matrix(0.98, 0, 0, 0.98, 0, 0)');
  await page.mouse.up();
});

// C25 - o herói entra uma vez e o par da estrutura se desenvolve uma vez
test('hero_enters_once_and_the_pair_develops_once', async ({ page }) => {
  // o herói monta junto com o documento: a amostragem é instalada antes da navegação
  await page.addInitScript(() => {
    type HeroFrame = { t: number; opacity: string; transform: string };
    const frames: HeroFrame[] = [];
    (window as unknown as { __heroFrames: HeroFrame[] }).__heroFrames = frames;
    const start = performance.now();
    const tick = (t: number) => {
      const element = document.querySelector('[data-slot="hero-content"]');
      if (element) frames.push({ t, opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform });
      if (t - start < 1600) requestAnimationFrame(tick);
      else (window as unknown as { __heroDone: boolean }).__heroDone = true;
    };
    requestAnimationFrame(tick);
  });
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __heroDone?: boolean }).__heroDone === true);
  const hero = await page.evaluate(() => (window as unknown as { __heroFrames: Array<{ t: number; opacity: string; transform: string }> }).__heroFrames);
  expect(hero.length).toBeGreaterThan(10);

  const first = hero[0]!;
  expect(Number(first.opacity)).toBeLessThan(0.5);
  expect(Math.abs(scaleOf(first.transform) - 1)).toBeLessThan(0.001);
  expect(Math.abs(Number.parseFloat(/,\s*([-\d.]+)\)$/.exec(first.transform)?.[1] ?? '0') - 12)).toBeLessThan(1);

  const last = hero[hero.length - 1]!;
  expect(last.opacity).toBe('1');
  expect(last.transform).toBe('none');

  const firstVisible = hero.findIndex((frame) => frame.opacity !== '0');
  const firstOpaque = hero.findIndex((frame) => frame.opacity === '1');
  expect(firstVisible).toBeGreaterThanOrEqual(0);
  expect(firstOpaque).toBeGreaterThan(firstVisible);
  const duration = hero[firstOpaque]!.t - hero[firstVisible]!.t;
  expect(duration, 'entrada do herói').toBeGreaterThanOrEqual(250);
  expect(duration, 'entrada do herói').toBeLessThanOrEqual(350);
  // uma vez: depois da entrada a opacidade não volta a cair
  for (const frame of hero.slice(firstOpaque)) expect(frame.opacity).toBe('1');

  // o par da estrutura: escala 1.06→1 e recorte, uma vez, na primeira entrada da seção
  await settle(page);
  await startSampling(page, ['[data-slot="structure-photo"]'], { all: true, ms: 1_200 });
  await page.locator('#estrutura').evaluate((element) => element.scrollIntoView());
  const frames = await framesOf(page);
  expect(frames.length).toBeGreaterThan(10);
  const scaleAt = (index: number) => scaleOf((frames[index]!.targets[0] ?? {})['transform'] ?? 'none');
  const clipAt = (index: number) => (frames[index]!.targets[0] ?? {})['clip-path'] ?? 'none';

  const firstScale = scaleAt(0);
  expect(firstScale).toBeGreaterThanOrEqual(1.04);
  expect(firstScale).toBeLessThanOrEqual(1.08);
  expect(clipAt(0)).not.toBe('none');
  let started = -1;
  for (const [index] of frames.entries()) {
    if (started === -1 && scaleAt(index) < 1.058) started = index;
  }
  expect(started).toBeGreaterThan(-1);
  let developed = -1;
  for (const [index] of frames.entries()) {
    if (developed === -1 && Math.abs(scaleAt(index) - 1) < 0.002) developed = index;
  }
  expect(developed).toBeGreaterThan(started);
  expect(Math.abs(scaleAt(frames.length - 1) - 1)).toBeLessThan(0.002);
  const developDuration = frames[developed]!.t - frames[started]!.t;
  expect(developDuration, 'desenvolvimento do par').toBeLessThanOrEqual(900);
  expect(developDuration, 'desenvolvimento do par').toBeGreaterThanOrEqual(300);
  expect(['none', 'inset(0%)', 'inset(0px)', 'inset(0% 0% 0% 0%)']).toContain(clipAt(frames.length - 1));

  // uma vez: rolar para longe e voltar não reinicia
  await page.locator('#visita').evaluate((element) => element.scrollIntoView());
  await page.waitForTimeout(300);
  await page.locator('#estrutura').evaluate((element) => element.scrollIntoView());
  await page.waitForTimeout(300);
  const steady = await page.locator('[data-slot="structure-photo"]').first().evaluate((element) => getComputedStyle(element).transform);
  expect(Math.abs(scaleOf(steady) - 1)).toBeLessThan(0.002);
});

// C25 - com movimento reduzido o herói e o par repousam no estado final
test('reduced_motion_rests_the_landing_at_the_final_state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await settle(page);

  const hero = page.locator('[data-slot="hero-content"]');
  await expect(hero).toHaveCSS('opacity', '1');
  await expect(hero).toHaveCSS('transform', 'none');
  await expect(page.locator('[data-slot="hero-cta"]')).toBeVisible();

  await page.locator('#estrutura').evaluate((element) => element.scrollIntoView());
  await page.waitForTimeout(300);
  for (const photo of await page.locator('[data-slot="structure-photo"]').all()) {
    await expect(photo).toHaveCSS('transform', 'none');
    const clip = await photo.evaluate((element) => getComputedStyle(element).clipPath);
    expect(['none', 'inset(0%)', 'inset(0px)', 'inset(0% 0% 0% 0%)']).toContain(clip);
  }
  const running = await page.evaluate(
    () =>
      document.getAnimations().filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return target instanceof Element && target.closest('[data-slot="hero"], #estrutura') !== null;
      }).length,
  );
  expect(running).toBe(0);
});

// C26 - os planos são um bloco com réguas, sem valor
test('plans_are_a_ruled_block_without_a_price', async ({ page }) => {
  await page.goto('/');
  const plans = page.locator('#planos');
  await expect(plans.getByRole('heading', { level: 3, name: 'Plano mensal', exact: true })).toBeVisible();
  await expect(plans.locator('[data-slot="plan-price"]')).toHaveText('Consulte na recepção');
  for (const feature of SITE.plans.items[0]!.features) await expect(plans).toContainText(feature);
  await expect(plans.getByRole('link', { name: 'Matricule-se', exact: true })).toHaveCount(1);
  await expect(plans.getByRole('link', { name: 'Matricule-se', exact: true })).toHaveAttribute('href', '/matricula');

  const text = await plans.innerText();
  expect(text).not.toContain('R$');
  expect(text).not.toMatch(/\d+\s*(reais|por mês)/i);
  expect(SITE.plans.price).toBe('Consulte na recepção');
  expect(SITE.plans.items).toHaveLength(1);
  expect(SITE.plans.items[0]!.features).toHaveLength(3);

  const rules = await plans.locator('*').evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).borderTopWidth === '1px').length);
  expect(rules).toBeGreaterThanOrEqual(3);
});

// C27 - o fecho é a faixa do acento, com texto do acento invertido e todo par a 7:1
test('closing_band_uses_primary_and_meets_seven_to_one', async ({ page }) => {
  await page.goto('/');
  const closing = page.locator('#fecho');
  expect((await styleOf(closing, 'background-color')).rgb).toBe(LIME);
  expect((await styleOf(closing, 'color')).rgb).toBe(INK);
  await expect(closing.getByRole('heading', { level: 2 })).toHaveText('Seu treino começa hoje.');
  await expect(closing.getByRole('link', { name: 'Quero treinar', exact: true })).toHaveAttribute('href', '/matricula');

  const pairs = await closing.evaluate((root) => {
    const channels = (color: string) => (/(\d+(?:\.\d+)?)/g.exec(color) ? color.match(/[\d.]+/g)!.slice(0, 4).map(Number) : [0, 0, 0, 0]);
    const channel = (value: number) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r = 0, g = 0, b = 0]: number[]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    const background = (element: Element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const [r = 0, g = 0, b = 0, a = 0] = channels(getComputedStyle(node).backgroundColor);
        if (getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)' && (a !== 0 || getComputedStyle(node).backgroundColor.startsWith('rgb('))) return [r, g, b];
      }
      return [0, 0, 0];
    };
    const ratio = (text: number[], back: number[]) => {
      const [light, dark] = luminance(text) > luminance(back) ? [luminance(text), luminance(back)] : [luminance(back), luminance(text)];
      return (light + 0.05) / (dark + 0.05);
    };
    return [...root.querySelectorAll('h2, p, a')]
      .filter((element) => (element.textContent ?? '').trim().length > 0)
      .map((element) => ({
        text: (element.textContent ?? '').trim().slice(0, 40),
        ratio: ratio(channels(getComputedStyle(element).color), background(element)),
      }));
  });
  expect(pairs.length).toBeGreaterThanOrEqual(3);
  for (const pair of pairs) expect(pair.ratio, pair.text).toBeGreaterThanOrEqual(7);
});

// C28 - a barra de ação fixa segue o CTA do herói e os CTAs de seção
test('mobile_action_bar_follows_the_hero_and_section_ctas', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await settle(page);
  const header = page.locator('[data-slot="site-header"]');
  await expect(header.getByRole('img', { name: SITE.logo.alt, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: SITE.menu.open, exact: true })).toBeVisible();
  await expect(header.getByRole('link', { name: SITE.labels.guest, exact: true })).toHaveCount(0);
  await expect(header.getByRole('navigation', { name: SITE.labels.nav, exact: true })).toBeHidden();

  const bar = page.locator('[data-slot="action-bar"]');
  await expect(bar).toHaveAttribute('href', '/matricula');
  expect(await bar.getAttribute('style')).toContain('env(safe-area-inset-bottom)');
  await expect(bar).toBeHidden();

  await page.locator('#visita').evaluate((element) => element.scrollIntoView());
  await page.evaluate(() => window.scrollTo(0, 1_000));
  await expect(bar).toBeVisible();
  expect(Math.round((await bar.boundingBox())!.height)).toBe(44);
  expect((await styleOf(bar, 'padding-bottom')).raw).toBe('0px');

  await page.locator('#fecho').evaluate((element) => element.scrollIntoView());
  await expect(bar).toBeHidden();

  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/');
  await page.locator('#visita').evaluate((element) => element.scrollIntoView());
  await expect(bar).toBeHidden();

  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
  await expect(bar).toBeHidden();
});

// C29 - a landing não busca outra origem nem viola o CSP
test('landing_stays_same_origin_without_csp_violation', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (event) => violations.push(event.violatedDirective));
  });
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
  await settle(page);

  expect([...origins]).toEqual([new URL(baseURL!).origin]);
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
});

// C30 - sem rolagem horizontal e com as mesmas bordas em cinco larguras
test('no_horizontal_scroll_and_shared_edges_at_five_widths', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? NARROW.height : 900 });
    await page.goto('/');
    const [scroll, client] = await widthsOf(page);
    expect(scroll, `${width}`).toBe(client);

    const edges = await page
      .locator('[data-slot="section-head"], [data-slot="section-body"], [data-slot="hero-content"]')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { left: Math.round(box.left), right: Math.round(box.right) };
        }),
      );
    expect(edges.length, `${width}`).toBeGreaterThan(5);
    for (const edge of edges) {
      expect(edge.left, `${width} esquerda`).toBe(edges[0]!.left);
      expect(edge.right, `${width} direita`).toBe(edges[0]!.right);
    }
  }
});

// Extra do round 2 - door 3: o logo é o arquivo de 96 px no cabeçalho e no rodapé (`plan.md:108`)
test('landing_logo_is_the_96_in_the_header_and_the_footer', async ({ page }) => {
  await page.goto('/');
  const headerLogo = page.locator('[data-slot="site-header"] img[data-slot="hero-logo"]');
  const footerLogo = page.locator('footer img[data-slot="footer-logo"]');
  await expect(headerLogo).toHaveCount(1);
  await expect(footerLogo).toHaveCount(1);
  await expect(headerLogo).toBeVisible();
  await expect(footerLogo).toBeVisible();

  expect(SITE.logo.src).toBe('/dukfit/logo-dukfit-96.webp');
  for (const [slot, logo] of [
    ['cabeçalho', headerLogo],
    ['rodapé', footerLogo],
  ] as const) {
    expect(await logo.getAttribute('src'), slot).toBe('/dukfit/logo-dukfit-96.webp');
    expect(await logo.getAttribute('alt'), slot).toBe(SITE.logo.alt);
  }
});

// Extra do round 2 - door 6: a palavra da navegação desenha a régua no hover (`sections.md:398-401`)
test('nav_word_draws_its_ruler_on_hover', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await settle(page);

  const word = page
    .locator('[data-slot="site-header"]')
    .getByRole('navigation', { name: SITE.labels.nav, exact: true })
    .getByRole('link', { name: SITE.nav[0]!.label, exact: true });
  await expect(word).toBeVisible();

  const ruler = () =>
    word.evaluate((element) => {
      const style = getComputedStyle(element, '::after');
      return {
        transform: style.transform,
        origin: style.transformOrigin,
        height: style.height,
        background: style.backgroundColor,
        duration: style.transitionDuration,
      };
    });

  // antes do hover a régua existe, mas está recolhida à esquerda
  const rest = await ruler();
  expect(scaleOf(rest.transform)).toBeCloseTo(0, 2);
  expect(rest.height).toBe('1px');
  expect(rest.background).toBe(LIME);
  expect(rest.origin.startsWith('0px')).toBe(true);
  const milliseconds = Number.parseFloat(rest.duration) * 1_000;
  expect(milliseconds).toBeGreaterThanOrEqual(150);
  expect(milliseconds).toBeLessThanOrEqual(250);

  // no hover a palavra desenha a régua da esquerda para a direita
  await word.hover();
  await expect.poll(async () => scaleOf((await ruler()).transform)).toBeCloseTo(1, 2);
});

// Extra do round 2 - doors 3/4: `story` 4:3 na academia e `pair` com o mesmo ratio e topos alinhados
test('about_photo_is_a_four_by_three_story_and_structure_pair_levels_the_tops', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await settle(page);

  const ratioOf = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    return box.width / box.height;
  };

  // `story` na `#academia`: a foto 4:3 ao lado do texto, nunca atrás dele
  const story = page.locator('#academia [data-slot="story"]');
  await expect(story).toHaveCount(1);
  const frame = story.locator('[data-slot="photo-frame"]');
  await expect(frame).toHaveCount(1);
  expect(await ratioOf(frame)).toBeCloseTo(4 / 3, 1);

  const textBox = (await story.locator('[data-slot="story-text"]').boundingBox())!;
  const frameBox = (await frame.boundingBox())!;
  expect(textBox.x + textBox.width, 'texto à esquerda da foto').toBeLessThanOrEqual(frameBox.x);
  expect(Math.min(textBox.y + textBox.height, frameBox.y + frameBox.height), 'texto e foto na mesma faixa').toBeGreaterThan(
    Math.max(textBox.y, frameBox.y),
  );

  // `pair` na `#estrutura`: duas fotos do mesmo ratio, com os topos alinhados
  const pair = page.locator('#estrutura [data-slot="pair"]');
  await expect(pair).toHaveCount(1);
  const photos = pair.locator('[data-slot="structure-photo"]');
  await expect(photos).toHaveCount(2);
  await pair.scrollIntoViewIfNeeded();
  // o `picture-develops` roda uma vez: a prova mede o estado final
  await expect.poll(async () => photos.first().evaluate((element) => getComputedStyle(element).transform), { timeout: 5_000 }).toBe('none');

  const boxes = await photos.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, top: box.top };
    }),
  );
  for (const [index, box] of boxes.entries()) {
    expect(box.width / box.height, `par ${index}`).toBeCloseTo(4 / 3, 1);
  }
  expect(Math.abs(boxes[0]!.top - boxes[1]!.top), 'topos alinhados').toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[0]!.width - boxes[1]!.width), 'mesma largura').toBeLessThanOrEqual(1);
});

// Extra do round 2 - binding source do skill: o texto de lista da landing a 16/24 no mínimo (`sections.md:409-410`)
test('landing_list_text_is_sixteen', async ({ page }) => {
  const lists = [
    { label: 'horário e rotas da visita', selector: '#visita [data-slot="visit-hours"], #visita [data-slot="route-link"]', count: 4 },
    { label: 'features dos planos', selector: '#planos [data-slot="plan-feature"]', count: 3 },
    { label: 'itens da estrutura', selector: '#estrutura [data-slot="structure-item"] p', count: 3 },
    { label: 'itens do bloco de diferenciais', selector: '#academia [data-slot="why-item"] p', count: 4 },
  ];

  for (const size of [DESKTOP, MOBILE]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await settle(page);
    for (const list of lists) {
      const metrics = await page.locator(list.selector).evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return { size: Number.parseFloat(style.fontSize), line: Number.parseFloat(style.lineHeight) };
        }),
      );
      expect(metrics.length, `${list.label} a ${size.width}`).toBe(list.count);
      for (const metric of metrics) {
        expect(metric.size, `${list.label} a ${size.width} px`).toBeGreaterThanOrEqual(16);
        expect(metric.line, `${list.label} a ${size.width} px`).toBeGreaterThanOrEqual(24);
      }
    }
  }
});

