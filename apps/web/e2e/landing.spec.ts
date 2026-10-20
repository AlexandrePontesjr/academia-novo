import type { Page } from '@playwright/test';
import { expect, sessionOf, test } from './support/fake-api.ts';
import { serveWorld } from './support/identidade.ts';
import { SITE } from '../src/app/site-content.ts';

/**
 * A prova da `dukfit-landing` (`.specs/features/dukfit-landing`): a landing com o conteúdo e as imagens
 * reais da academia, as imagens servidas sem sessão e o logo no login e no shell.
 */

const MOBILE = { width: 390, height: 844 };
const NARROW = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
const TAGLINE = SITE.tagline.join(' ');

const region = (page: Page, name: string) => page.getByRole('main').getByRole('region', { name, exact: true });

/** O caminho de um `src` de imagem, sem a origem. */
const pathOf = (src: string | null) => (src ? new URL(src, 'http://x').pathname : null);

// S1 - a landing com a academia real

test('hero_shows_logo_eyebrow_three_line_title_intro_and_proof', async ({ page }) => {
  await page.goto('/');
  const hero = region(page, TAGLINE);

  const logo = hero.getByRole('img', { name: 'DUK FIT Academia', exact: true });
  await expect(logo).toBeVisible();
  expect(pathOf(await logo.getAttribute('src'))).toBe('/dukfit/logo-dukfit-512.webp');
  await expect(hero.getByText('Academia em Flores, Manaus', { exact: true })).toBeVisible();

  const title = hero.getByRole('heading', { level: 1 });
  await expect(title).toHaveAccessibleName(TAGLINE);
  const lines = title.locator('[data-slot="tagline-line"]');
  expect((await lines.allTextContents()).map((line) => line.trim())).toEqual(['Seu corpo.', 'Seu ritmo.', 'Sua evolução.']);
  // uma linha cada: as três caixas empilhadas
  const boxes = await lines.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
  expect(boxes[1]!).toBeGreaterThan(boxes[0]!);
  expect(boxes[2]!).toBeGreaterThan(boxes[1]!);

  await expect(hero.getByText(SITE.intro, { exact: true })).toBeVisible();
  const proof = hero.locator('[data-slot="proof"]');
  await expect(proof.locator('strong')).toHaveText('10+');
  await expect(proof).toContainText('Anos fazendo parte da rotina de Flores');
});

test('hero_photo_loads_first_under_a_dark_overlay', async ({ page }) => {
  await page.goto('/');
  const photo = page.locator('[data-slot="hero-photo"]');
  expect(pathOf(await photo.getAttribute('src'))).toBe('/dukfit/salao-cardio-1600.webp');
  await expect(photo).toHaveAttribute('fetchpriority', 'high');
  expect(await photo.getAttribute('loading')).toBeNull();

  // contraste do pior caso: o véu escuro composto sobre um pixel branco da foto
  const ratios = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const over = (color: string) => {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const luminance = (channels: number[]) => {
      const [r, g, b] = channels.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const veil = getComputedStyle(document.querySelector('[data-slot="hero-overlay"]')!).backgroundColor;
    const background = luminance(over(veil));
    return [...document.querySelectorAll('[data-slot="tagline-line"]')].map((line) => {
      const text = luminance(over(getComputedStyle(line).color));
      const [light, dark] = text > background ? [text, background] : [background, text];
      return (light + 0.05) / (dark + 0.05);
    });
  });
  expect(ratios).toHaveLength(3);
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('sections_follow_the_approved_order', async ({ page }) => {
  await page.goto('/');
  const names = await page
    .getByRole('main')
    .locator('section[aria-labelledby]')
    .evaluateAll((sections) =>
      sections.map((section) => document.getElementById(section.getAttribute('aria-labelledby')!)!.textContent!.trim()),
    );
  expect(names).toEqual([TAGLINE, 'Sobre a Dukfit', 'O que você encontra', 'Nossa estrutura', 'Horário', 'Onde estamos']);
  expect(await page.getByRole('main').locator('h2').count()).toBe(5);
  // o rodapé vem depois do `main`
  const after = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const footer = document.querySelector('footer')!;
    return Boolean(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(after).toBe(true);
});

test('about_section_has_title_text_and_two_photos', async ({ page }) => {
  await page.goto('/');
  const about = region(page, 'Sobre a Dukfit');
  await expect(about.getByRole('heading', { level: 2 })).toHaveText('Treino de verdade. Presença todos os dias.');
  await expect(about.getByText(SITE.about.text, { exact: true })).toBeVisible();
  expect(SITE.about.text).toContain('Conjunto Duque de Caxias');
  const photos = about.getByRole('img');
  await expect(photos).toHaveCount(2);
  expect([pathOf(await photos.nth(0).getAttribute('src')), pathOf(await photos.nth(1).getAttribute('src'))]).toEqual([
    '/dukfit/musculacao-440.webp',
    '/dukfit/cardio-440.webp',
  ]);
  await expect(photos.nth(0)).toHaveAttribute('alt', SITE.about.photos[0].alt);
  await expect(photos.nth(1)).toHaveAttribute('alt', SITE.about.photos[1].alt);
});

test('structure_cards_are_the_three_numbered_panels', async ({ page }) => {
  await page.goto('/');
  const cards = region(page, 'O que você encontra').locator('[data-slot="structure-card"]');
  await expect(cards).toHaveCount(3);
  const expected = [
    ['01', 'Musculação'],
    ['02', 'Acompanhamento'],
    ['03', 'Cardio'],
  ];
  for (const [index, [number, title]] of expected.entries()) {
    const card = cards.nth(index);
    await expect(card.locator('span').first()).toHaveText(number!);
    await expect(card.getByRole('heading', { level: 3 })).toHaveText(title!);
    await expect(card).toContainText(SITE.structure[index]!.text);
    // o `Panel` da referência: fundo #141414 e raio de 24 px
    const style = await card.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { radius: computed.borderTopLeftRadius, background: computed.backgroundColor };
    });
    expect(style.radius).toBe('24px');
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  }
});

test('gallery_shows_four_captioned_photos_in_order', async ({ page }) => {
  await page.goto('/');
  const figures = region(page, 'Nossa estrutura').locator('figure');
  await expect(figures).toHaveCount(4);
  const expected = [
    ['/dukfit/salao-cardio-800.webp', '01 Cardio e musculação'],
    ['/dukfit/musculacao-440.webp', '02 Treino em movimento'],
    ['/dukfit/cardio-440.webp', '03 Estrutura completa'],
    ['/dukfit/amanhecer-440.webp', '04 Desde cedo com você'],
  ];
  for (const [index, [src, caption]] of expected.entries()) {
    const figure = figures.nth(index);
    const image = figure.locator('img');
    expect(pathOf(await image.getAttribute('src'))).toBe(src);
    await expect(image).toHaveAttribute('alt', SITE.gallery[index]!.alt);
    await expect(figure.locator('figcaption')).toHaveText(caption!);
  }
});

test('location_has_address_neighborhood_and_three_route_links', async ({ page }) => {
  await page.goto('/');
  const location = region(page, 'Onde estamos');
  const address = location.locator('address');
  await expect(address).toContainText('Rua Uberaba, Av. Duque de Caxias, 135');
  await expect(address).toContainText('Conjunto Flores, Manaus–AM, 69093-000');
  await expect(location.getByText('Conjunto Flores', { exact: true })).toBeVisible();

  for (const [name, key, prefix] of [
    ['Google Maps', 'google', 'https://www.google.com/maps/'],
    ['Waze', 'waze', 'https://waze.com/ul'],
    ['Uber', 'uber', 'https://m.uber.com/'],
  ] as const) {
    const link = location.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', SITE.routes[key]);
    expect(SITE.routes[key].startsWith(prefix), name).toBe(true);
  }
});

test('footer_has_small_logo_tagline_and_instagram', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  expect(pathOf(await footer.locator('img').getAttribute('src'))).toBe('/dukfit/logo-dukfit-96.webp');
  await expect(footer.getByText('Musculação e acompanhamento em Flores, Manaus.', { exact: true })).toBeVisible();
  await expect(footer.getByRole('link', { name: '@dukfitacademia' })).toHaveAttribute(
    'href',
    'https://www.instagram.com/dukfitacademia/',
  );
});

test('external_links_open_in_a_new_tab_without_referrer', async ({ page }) => {
  await page.goto('/');
  const links = await page.locator('a[href^="http"]').evaluateAll((anchors) =>
    anchors.map((anchor) => ({ target: anchor.getAttribute('target'), rel: anchor.getAttribute('rel') ?? '' })),
  );
  expect(links).toHaveLength(4);
  for (const link of links) {
    expect(link.target).toBe('_blank');
    expect(link.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  }
});

test('no_phone_whatsapp_or_sign_up', async ({ page }) => {
  await page.goto('/');
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\(\d{2}\) \d/);
  expect(text).not.toContain('Criar conta');
  await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
});

// S2 - imagens servidas e leves

test('images_are_public_webp_and_unknown_is_404', async ({ request, api }) => {
  expect(api.session).toBeUndefined();
  const image = await request.get('/dukfit/logo-dukfit-512.webp', { maxRedirects: 0 });
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/webp');
  const missing = await request.get('/dukfit/nao-existe.webp', { maxRedirects: 0 });
  expect(missing.status()).toBe(404);
});

test('images_have_size_alt_and_lazy_loading', async ({ page }) => {
  await page.goto('/');
  // rola até o fim para que as preguiçosas carreguem
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  const images = await page.locator('img').evaluateAll((items) =>
    items.map((image) => ({
      slot: image.getAttribute('data-slot'),
      width: image.getAttribute('width'),
      height: image.getAttribute('height'),
      alt: image.getAttribute('alt'),
      loading: image.getAttribute('loading'),
      natural: (image as HTMLImageElement).naturalWidth,
    })),
  );
  expect(images.length).toBeGreaterThanOrEqual(9);
  for (const image of images) {
    expect(image.width, JSON.stringify(image)).toBeTruthy();
    expect(image.height, JSON.stringify(image)).toBeTruthy();
    expect(image.alt, JSON.stringify(image)).toBeTruthy();
    expect(image.natural, JSON.stringify(image)).toBeGreaterThan(0);
    const firstFold = image.slot === 'hero-photo' || image.slot === 'hero-logo';
    expect(image.loading, JSON.stringify(image)).toBe(firstFold ? null : 'lazy');
  }
});

test('no_image_overflow_and_no_horizontal_scroll', async ({ page }) => {
  for (const size of [NARROW, DESKTOP]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const result = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      overflowing: [...document.querySelectorAll('img')]
        .filter((image) => image.getAttribute('data-slot') !== 'hero-photo')
        .filter((image) => {
          const box = image.getBoundingClientRect();
          const parent = image.parentElement!.getBoundingClientRect();
          return box.left < parent.left - 1 || box.right > parent.right + 1;
        }).length,
    }));
    expect(result.scroll, `${size.width}`).toBe(result.client);
    expect(result.overflowing, `${size.width}`).toBe(0);
  }
});

// S3 - a marca no login e no shell

test('logo_sits_before_the_wordmark_on_login_and_desktop_shell', async ({ page, api }) => {
  const brandIn = async (scope: ReturnType<Page['locator']>) => {
    const logo = scope.locator('[data-slot="brand-logo"]');
    await expect(logo).toBeVisible();
    expect(pathOf(await logo.getAttribute('src'))).toBe('/dukfit/logo-dukfit-96.webp');
    const box = (await logo.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([40, 40]);
    const order = await scope.locator('[data-slot="brand"]').evaluate((brand) =>
      [...brand.children].map((child) => child.getAttribute('data-slot')),
    );
    expect(order).toEqual(['brand-logo', 'wordmark']);
    await expect(scope.locator('[data-slot="wordmark"]')).toHaveText('DukFit');
  };

  await page.goto('/login');
  await brandIn(page.locator('main'));

  serveWorld(api, 'admin');
  api.session = sessionOf('admin');
  await page.setViewportSize(DESKTOP);
  await page.goto('/students');
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveAccessibleName('DukFit');
  await brandIn(title);

  await page.setViewportSize(MOBILE);
  await page.goto('/students');
  await expect(page.locator('[data-slot="brand-logo"]')).toBeHidden();
});
