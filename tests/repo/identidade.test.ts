import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

/** Os testes de repositório da identidade visual: o que não se lê de um elemento renderizado. */

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const GLOBALS = 'packages/ui/src/globals.css';
const LAYOUT = 'apps/web/src/app/layout.tsx';
const FONT = 'apps/web/src/fonts/manrope-variable.woff2';
const LICENSE = 'apps/web/src/fonts/OFL.txt';

/** Os tokens da referência visual de 2026-10-21 (preto puro e o amarelo #fcf43c), token por token. */
const TOKENS: Array<[name: string, value: string]> = [
  ['--background', '#000000'],
  ['--foreground', '#fafafa'],
  ['--card', '#0f0f0f'],
  ['--muted', '#1a1a1a'],
  ['--muted-foreground', '#a3a3a3'],
  ['--border', '#262626'],
  ['--input', '#2a2a2a'],
  ['--ring', '#fcf43c'],
  ['--primary', '#fcf43c'],
  ['--primary-foreground', '#000000'],
  ['--secondary', '#1a1a1a'],
  ['--secondary-foreground', '#fafafa'],
  ['--destructive', '#dc2626'],
  ['--destructive-foreground', '#fafafa'],
  ['--radius', '1rem'],
];

test('identity_tokens_and_radius_resolve_the_door_one_literal', () => {
  const css = read(GLOBALS);
  expect(css).toContain('color-scheme: dark;');
  for (const [name, value] of TOKENS) expect(css, name).toContain(`${name}: ${value};`);

  // o tema é fixo: nenhuma consulta de preferência do sistema troca a paleta
  expect(css).not.toContain('prefers-color-scheme');
  // a raiz clara anterior não existe mais
  expect(css).not.toContain('--background: oklch(1 0 0)');
  expect(css).not.toContain('--foreground: oklch(0.145 0 0);\n  --muted: oklch(0.97 0 0)');
});

test('print_media_resets_the_tokens_to_white_and_black', () => {
  const css = read(GLOBALS);
  const start = css.indexOf('@media print');
  expect(start).toBeGreaterThan(-1);
  const block = css.slice(start);

  expect(block).toContain('color-scheme: light;');
  expect(block).toContain('--background: #ffffff;');
  expect(block).toContain('--foreground: #000000;');
  expect(block).toMatch(/body\s*\{[^}]*background-color: #ffffff;/);
  expect(block).toMatch(/body\s*\{[^}]*color: #000000;/);
});

test('manrope_font_asset_is_self_hosted_with_the_ofl_license', () => {
  const font = readFileSync(join(ROOT, FONT));
  expect(font.subarray(0, 4).toString('latin1')).toBe('wOF2');

  const license = read(LICENSE);
  expect(license).toContain('SIL Open Font License');

  const layout = read(LAYOUT);
  expect(layout).toContain("from 'next/font/local'");
  expect(layout).toContain('manrope-variable.woff2');
  expect(layout).toContain("weight: '400 800'");
  expect(layout).toContain("variable: '--font-manrope'");
  expect(layout).not.toContain('fonts.googleapis');
  expect(layout).not.toContain('<link');

  const css = read(GLOBALS);
  expect(css).toContain('font-family: var(--font-manrope), system-ui, sans-serif;');
});

test('only_the_manrope_asset_and_its_ofl_license_are_new', () => {
  expect(readdirSync(join(ROOT, 'apps/web/src/fonts')).sort()).toEqual([
    'OFL.txt',
    'manrope-variable.woff2',
  ]);
});

// dukfit-app: a landing lê o texto só de `site-content.ts` (door 4)

const SITE_CONTENT = 'apps/web/src/app/site-content.ts';
const LANDING = 'apps/web/src/app/page.tsx';

test('site_content_is_the_only_source_of_landing_copy', () => {
  const content = read(SITE_CONTENT);
  // a forma da door 3 da dukfit-landing, que supersede a lista de chaves da dukfit-app
  const keys = ['name', 'legalName', 'eyebrow', 'tagline', 'intro', 'proof', 'about', 'structure', 'gallery', 'hours'];
  for (const key of [...keys, 'address', 'neighborhood', 'routes', 'instagram', 'logo', 'hero']) {
    expect(content, key).toMatch(new RegExp(`^  ${key}: `, 'm'));
  }
  // o texto de exemplo saiu, e a academia não tem telefone nem WhatsApp no conteúdo (AC 11, AC 12)
  for (const placeholder of ['EXEMPLO', 'Rua Exemplo', '0000-0000', 'whatsapp', 'phone']) {
    expect(content.toLowerCase(), placeholder).not.toContain(placeholder.toLowerCase());
  }
  expect(content).toMatch(/^export const SITE = \{$/m);
  expect(content).toContain("  name: 'DukFit',");

  const landing = read(LANDING);
  expect(landing).toContain("from './site-content.ts';");
  // a única leitura de servidor é a sessão, para o CTA; nada de API de academia, planos ou painel
  const imports = [...landing.matchAll(/from '([^']+)';/g)].map((match) => match[1]);
  expect(imports.filter((path) => path!.includes('/lib/'))).toEqual(['../lib/session.ts']);
  expect(landing).not.toMatch(/fetchApi|loadDashboard|\/api\//);
});

// motion: o único pacote novo é o `motion`, no catálogo e em dois manifestos (door 6, que substitui a AC 50 da dukfit-app)

test('motion_is_the_only_added_dependency', () => {
  const manifests = execFileSync('git', ['ls-files', '*package.json'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((path) => path && !path.includes('node_modules'));
  expect(manifests.length).toBeGreaterThan(5);
  const declaring = manifests.filter((path) => {
    const manifest = JSON.parse(read(path)) as Record<string, Record<string, string> | undefined>;
    const deps = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    if ('motion' in deps) expect(deps.motion, path).toBe('catalog:');
    return 'motion' in deps;
  });
  expect(declaring.sort()).toEqual(['apps/web/package.json', 'packages/ui/package.json']);

  const workspace = read('pnpm-workspace.yaml');
  expect(workspace).toMatch(/^catalog:\n(?: {2}.+\n)*? {2}motion: \^14\.5\.0\n/m);
  expect(read('pnpm-lock.yaml')).toContain('motion@14.5.0');
});

// dukfit-landing: as imagens da academia são arquivos estáticos pré-convertidos (door 1) e públicos (door 2)

const IMAGES = 'apps/web/public/dukfit';
const DUKFIT_IMAGES = [
  'amanhecer-440.webp',
  'cardio-440.webp',
  'logo-dukfit-512.webp',
  'logo-dukfit-96.webp',
  'musculacao-440.webp',
  'salao-cardio-1600.webp',
  'salao-cardio-800.webp',
];

test('dukfit_images_are_the_seven_light_webp_files', () => {
  expect(readdirSync(join(ROOT, IMAGES)).sort()).toEqual(DUKFIT_IMAGES);
  for (const file of DUKFIT_IMAGES) {
    const bytes = readFileSync(join(ROOT, IMAGES, file));
    expect(bytes.subarray(0, 4).toString('latin1'), file).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1'), file).toBe('WEBP');
    expect(bytes.length, file).toBeLessThanOrEqual(400 * 1024);
  }
  expect(read('apps/web/src/proxy.ts')).toContain("matcher: ['/((?!api/|_next/|favicon.ico|dukfit/).*)'],");
});

// dukfit-landing, verificação 1: todo texto da landing vem de `SITE` (AC 12) na forma das doors 3 e 5

test('landing_page_has_no_literal_text_in_jsx', () => {
  const landing = read(LANDING);
  // texto entre tags: o que sobra de `>texto<` que não é expressão nem espaço
  const between = [...landing.matchAll(/>([^<>{}]*)</g)].map((match) => match[1]!.trim()).filter((text) => /[A-Za-zÀ-ú]/.test(text));
  expect(between).toEqual([]);
  // linhas de JSX que são texto puro (nem tag, nem expressão, nem código)
  const jsxText = landing
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-zÀ-ú@][^=();<>{}]*$/.test(line) && !line.startsWith('//') && !/^(return|const|export|import|type|interface)\b/.test(line));
  expect(jsxText).toEqual([]);
  // atributos que a pessoa lê: nenhum literal
  expect(landing).not.toMatch(/(?:alt|aria-label|title|placeholder)="[^"]+"/);
});

test('site_content_has_the_door_five_shape', async () => {
  const { SITE } = await import('../../apps/web/src/app/site-content.ts');
  const keysOf = (value: object) => Object.keys(value).sort();
  expect(keysOf(SITE)).toEqual(
    [
      'about', 'address', 'closing', 'cta', 'eyebrow', 'footer', 'gallery', 'galleryLabels', 'hero', 'hours',
      'instagram', 'intro', 'labels', 'legalName', 'logo', 'name', 'nav', 'neighborhood', 'newsletter', 'plans',
      'proof', 'rights', 'routeLabels', 'routes', 'scroll', 'sections', 'structure', 'tagline', 'why',
    ].sort(),
  );
  expect(keysOf(SITE.sections)).toEqual(['about', 'gallery', 'hours', 'location', 'plans', 'structure', 'why']);
  for (const section of Object.values(SITE.sections)) expect(keysOf(section)).toEqual(['eyebrow', 'title']);
  expect(keysOf(SITE.address)).toEqual(['district', 'street']);
  expect(keysOf(SITE.about)).toEqual(['badge', 'highlight', 'lead', 'photo', 'text']);
  expect(keysOf(SITE.logo)).toEqual(['alt', 'small', 'src']);
  expect(keysOf(SITE.routes)).toEqual(['google', 'uber', 'waze']);
  expect(keysOf(SITE.routeLabels)).toEqual(['google', 'uber', 'waze']);
  expect(keysOf(SITE.cta)).toEqual(['guest', 'join', 'member', 'visit']);
  expect(keysOf(SITE.hours)).toEqual(['closes', 'days', 'opens']);
  for (const photo of [...SITE.gallery, SITE.about.photo, SITE.why.photo]) expect(keysOf(photo)).toEqual(expect.arrayContaining(['alt', 'height', 'src', 'width']));
});
