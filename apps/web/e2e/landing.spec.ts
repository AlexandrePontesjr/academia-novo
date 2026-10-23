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

// S1 - a landing com a academia real, na disposição da referência visual de 2026-10-21

test('hero_shows_logo_nav_eyebrow_two_line_title_intro_and_proof', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  const hero = region(page, TAGLINE);

  // o logo e a navegação saíram do hero para o cabeçalho flutuante, o `banner` da página (motion, door 7)
  const banner = page.getByRole('banner');
  const logo = banner.getByRole('img', { name: 'DUK FIT Academia', exact: true });
  await expect(logo).toBeVisible();
  expect(pathOf(await logo.getAttribute('src'))).toBe('/dukfit/logo-dukfit-512.webp');
  await expect(hero.getByText('Academia em Flores, Manaus', { exact: true })).toBeVisible();
  const nav = banner.getByRole('navigation', { name: 'Seções' });
  expect(await nav.getByRole('link').allTextContents()).toEqual(['Sobre', 'Modalidades', 'Estrutura', 'Planos', 'Contato']);
  await expect(hero.getByRole('navigation')).toHaveCount(0);
  await expect(hero.getByRole('img', { name: 'DUK FIT Academia', exact: true })).toHaveCount(0);

  const title = hero.getByRole('heading', { level: 1 });
  await expect(title).toHaveAccessibleName(TAGLINE);
  const lines = title.locator('[data-slot="tagline-line"]');
  expect((await lines.allTextContents()).map((line) => line.trim())).toEqual(['Treine', 'Todo Dia']);
  const boxes = await lines.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
  expect(boxes[1]!).toBeGreaterThan(boxes[0]!);

  await expect(hero.getByText(SITE.intro, { exact: true })).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Quero treinar' })).toHaveAttribute('href', '#planos');
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
  expect(ratios).toHaveLength(2);
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
  expect(names).toEqual([
    TAGLINE,
    'Sobre a Dukfit',
    'O que você encontra',
    'Por que a Dukfit',
    'Nossa estrutura',
    'Planos',
    'Onde estamos',
    'Horário',
  ]);
  expect(await page.getByRole('main').locator('h2').count()).toBe(7);
  // o rodapé vem depois do `main`
  const after = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const footer = document.querySelector('footer')!;
    return Boolean(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(after).toBe(true);
});

test('about_section_has_title_texts_photo_and_badge', async ({ page }) => {
  await page.goto('/');
  const about = region(page, 'Sobre a Dukfit');
  await expect(about.getByRole('heading', { level: 2 })).toHaveText(SITE.sections.about.title);
  await expect(about.getByText(SITE.about.lead, { exact: true })).toBeVisible();
  await expect(about.getByText(SITE.about.text, { exact: true })).toBeVisible();
  await expect(about).toContainText('Treine com consistência.');
  expect(SITE.about.text).toContain('Conjunto Duque de Caxias');
  const photo = about.getByRole('img', { name: SITE.about.photo.alt, exact: true });
  expect(pathOf(await photo.getAttribute('src'))).toBe('/dukfit/musculacao-440.webp');
  // o selo é decoração: fora da árvore de acessibilidade
  await expect(about.locator('[data-slot="about-badge"]')).toHaveAttribute('aria-hidden', 'true');
});

test('modalities_are_the_three_uppercase_rows', async ({ page }) => {
  await page.goto('/');
  const section = region(page, 'O que você encontra');
  await expect(section.getByRole('heading', { level: 2 })).toHaveText('Modalidades');
  const rows = section.locator('[data-slot="structure-card"]');
  await expect(rows).toHaveCount(3);
  for (const [index, title] of ['Musculação', 'Acompanhamento', 'Cardio'].entries()) {
    const row = rows.nth(index);
    const heading = row.getByRole('heading', { level: 3 });
    await expect(heading).toHaveText(title);
    await expect(row).toContainText(SITE.structure[index]!.text);
    expect(await heading.evaluate((element) => getComputedStyle(element).textTransform)).toBe('uppercase');
  }
});

test('why_section_has_photo_and_six_cards', async ({ page }) => {
  await page.goto('/');
  const section = region(page, 'Por que a Dukfit');
  await expect(section.getByRole('img', { name: SITE.why.photo.alt, exact: true })).toBeVisible();
  const cards = section.locator('[data-slot="why-card"]');
  await expect(cards).toHaveCount(6);
  for (const [index, item] of SITE.why.items.entries()) {
    await expect(cards.nth(index).getByRole('heading', { level: 3 })).toHaveText(item.title);
    await expect(cards.nth(index)).toContainText(item.text);
  }
});

test('gallery_shows_four_captioned_photos_in_order_with_arrows', async ({ page }) => {
  await page.goto('/');
  const section = region(page, 'Nossa estrutura');
  await expect(section.getByRole('heading', { level: 2 })).toHaveText(SITE.sections.gallery.title);
  const figures = section.locator('figure');
  await expect(figures).toHaveCount(4);
  const expected = [
    ['/dukfit/salao-cardio-800.webp', 'Cardio e musculação'],
    ['/dukfit/musculacao-440.webp', 'Treino em movimento'],
    ['/dukfit/cardio-440.webp', 'Estrutura completa'],
    ['/dukfit/amanhecer-440.webp', 'Desde cedo com você'],
  ];
  for (const [index, [src, caption]] of expected.entries()) {
    const figure = figures.nth(index);
    const image = figure.locator('img');
    expect(pathOf(await image.getAttribute('src'))).toBe(src);
    await expect(image).toHaveAttribute('alt', SITE.gallery[index]!.alt);
    await expect(figure.locator('figcaption')).toHaveText(caption!);
  }

  const list = section.locator('[data-slot="gallery"]');
  const before = await list.evaluate((element) => element.scrollLeft);
  await section.getByRole('button', { name: 'Próxima foto' }).click();
  await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
  await expect(section.getByRole('button', { name: 'Foto anterior' })).toBeVisible();
});

// AD-106: um plano só, sem valor no site; a mensalidade é definida na matrícula
test('plans_show_one_card_without_a_price', async ({ page }) => {
  await page.goto('/');
  const section = region(page, 'Planos');
  const cards = section.locator('[data-slot="plan-card"]');
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole('heading', { level: 3 })).toHaveText('Plano mensal');
  await expect(section.locator('[data-slot="plan-price"]')).toHaveText('Consulte na recepção');
  await expect(cards.locator('li')).toHaveText(['Musculação e cardio', 'Acompanhamento da equipe', 'Acesso das 06:00 às 22:00']);
  // o destino passou de `#localizacao` (AD-106) ao pré-cadastro (AD-117)
  await expect(cards.getByRole('link', { name: 'Matricule-se' })).toHaveAttribute('href', '/matricula');
  // sem valor em reais e sem a chave Mensal/Anual
  await expect(section).not.toContainText('R$');
  await expect(section.getByRole('button')).toHaveCount(0);
});

test('location_has_address_neighborhood_and_three_route_links', async ({ page }) => {
  await page.goto('/');
  const location = region(page, 'Onde estamos');
  const address = location.locator('address');
  await expect(address).toContainText('Rua Uberaba, Av. Duque de Caxias, 135');
  await expect(address).toContainText('Conjunto Flores, Manaus–AM, 69093-000');

  await expect(location.getByRole('heading', { level: 2 })).toHaveText('Perto da sua rotina. Em Flores, Manaus.');
  await expect(location.locator('dl')).toContainText('Todos os dias, 06:00–22:00');
  await expect(location.locator('dl')).toContainText('Conjunto Flores');
  // as URLs literais da landing anterior (fonte binding), não a cópia de `SITE`
  for (const [name, href] of [
    ['Google Maps', 'https://www.google.com/maps/dir/?api=1&destination=DUK%20FIT%20Academia%2C%20Rua%20Uberaba%2C%20Av.%20Duque%20de%20Caxias%2C%20135%2C%20Conjunto%20Flores%2C%20Manaus-AM%2C%2069093-000&travelmode=driving&dir_action=navigate'],
    ['Waze', 'https://waze.com/ul?q=DUK%20FIT%20Academia%2C%20Rua%20Uberaba%2C%20Av.%20Duque%20de%20Caxias%2C%20135%2C%20Conjunto%20Flores%2C%20Manaus-AM%2C%2069093-000&navigate=yes&utm_source=dukfit'],
    ['Uber', 'https://m.uber.com/looking?pickup=my_location&dropoff%5Bnickname%5D=DUK%20FIT%20Academia&dropoff%5Bformatted_address%5D=Rua%20Uberaba%2C%20Av.%20Duque%20de%20Caxias%2C%20135%2C%20Conjunto%20Flores%2C%20Manaus-AM%2C%2069093-000'],
  ] as const) {
    await expect(location.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }
});

test('closing_banner_shows_the_hours', async ({ page }) => {
  await page.goto('/');
  const closing = region(page, 'Horário');
  await expect(closing.getByRole('heading', { level: 2 })).toHaveText(SITE.closing.title);
  await expect(closing).toContainText('Todos os dias, das 06:00 às 22:00.');
  await expect(closing.getByRole('link', { name: 'Como chegar' })).toHaveAttribute('href', SITE.routes.google);
});

test('footer_has_small_logo_tagline_wordmark_and_instagram', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  expect(pathOf(await footer.getByRole('img', { name: 'DUK FIT Academia' }).getAttribute('src'))).toBe('/dukfit/logo-dukfit-96.webp');
  await expect(footer.getByText('Musculação e acompanhamento em Flores, Manaus.', { exact: true })).toBeVisible();
  await expect(footer.locator('[data-slot="footer-wordmark"]')).toHaveText('DukFit');
  await expect(footer).toContainText(`© ${new Date().getFullYear()} DukFit.`);
  const instagram = footer.getByRole('link', { name: /@dukfitacademia/ });
  await expect(instagram).toHaveCount(2);
  for (const link of await instagram.all()) {
    await expect(link).toHaveAttribute('href', 'https://www.instagram.com/dukfitacademia/');
  }
});

test('external_links_open_in_a_new_tab_without_referrer', async ({ page }) => {
  await page.goto('/');
  const links = await page.locator('a[href^="http"]').evaluateAll((anchors) =>
    anchors.map((anchor) => ({ target: anchor.getAttribute('target'), rel: anchor.getAttribute('rel') ?? '' })),
  );
  // as três rotas, a rota do banner de horário e o Instagram duas vezes no rodapé
  expect(links).toHaveLength(6);
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
  // toda foto de conteúdo tem descrição; as decorativas têm `alt=""` explícito
  expect(images.filter((image) => image.alt).length).toBeGreaterThanOrEqual(9);
  for (const image of images) {
    expect(image.width, JSON.stringify(image)).toBeTruthy();
    expect(image.height, JSON.stringify(image)).toBeTruthy();
    expect(image.alt, JSON.stringify(image)).not.toBeNull();
    expect(image.natural, JSON.stringify(image)).toBeGreaterThan(0);
    const firstFold = image.slot === 'hero-photo' || image.slot === 'hero-logo' || image.slot === 'hero-avatar';
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
        // a miniatura inclinada da primeira modalidade só aparece no computador
        .filter((image) => image.getBoundingClientRect().width > 0)
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

test('matricule_se_links_to_matricula', async ({ page, api }) => {
  api.on('GET', '/api/leads/options', { status: 200, body: { google: false, term: { version: 1, text: 'Texto do termo.' } } });
  for (const session of [undefined, sessionOf('reception')]) {
    api.session = session;
    await page.goto('/');
    const link = region(page, 'Planos').getByRole('link', { name: 'Matricule-se', exact: true });
    await expect(link, session ? 'com sessão' : 'sem sessão').toHaveAttribute('href', '/matricula');
    await link.click();
    await expect(page, session ? 'com sessão' : 'sem sessão').toHaveURL('/matricula');
    await expect(page.getByRole('heading', { name: 'Pré-cadastro', exact: true })).toBeVisible();
  }
});
