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

/** A forma literal da door 1 do plano, token por token. */
const TOKENS: Array<[name: string, value: string]> = [
  ['--background', 'oklch(0.145 0 0)'],
  ['--foreground', 'oklch(0.970 0 0)'],
  ['--card', 'oklch(0.191 0 0)'],
  ['--muted', 'oklch(0.239 0 0)'],
  ['--muted-foreground', 'oklch(0.715 0 0)'],
  ['--border', 'oklch(0.269 0 0)'],
  ['--input', 'oklch(0.285 0 0)'],
  ['--ring', 'oklch(0.914 0.2148 121.5)'],
  ['--primary', 'oklch(0.914 0.2148 121.5)'],
  ['--primary-foreground', 'oklch(0.145 0 0)'],
  ['--secondary', 'oklch(0.239 0 0)'],
  ['--secondary-foreground', 'oklch(0.970 0 0)'],
  ['--destructive', 'oklch(0.577 0.215 27.3)'],
  ['--destructive-foreground', 'oklch(0.985 0 0)'],
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
