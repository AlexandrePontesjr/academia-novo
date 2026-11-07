import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

/** Os testes de repositório do refino visual: tokens, peças e guardas que não se leem de um elemento renderizado. */

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const GLOBALS = 'packages/ui/src/globals.css';
const STATUS_BADGE = 'packages/ui/src/components/status-badge.tsx';

/** O bloco CSS que começa em `start` (`@theme inline {`, `:root {`), da chave que abre até a que fecha. */
function blockOf(css: string, start: string): string {
  const at = css.indexOf(start);
  expect(at, start).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  throw new Error(`bloco sem fim: ${start}`);
}

/** O corpo de `declarations`: os pares `[nome, valor]` de um bloco CSS sem aninhamento (sem comentários). */
function declarationsOf(block: string): Array<[string, string]> {
  return [...block.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map(
    (match) => [match[1]!, match[2]!.trim()] as [string, string],
  );
}

/** Os `.ts`/`.tsx` (ou as extensões pedidas) de uma árvore, como caminho relativo à raiz. */
function filesOf(dir: string, extensions = ['.ts', '.tsx']) {
  const found: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(join(ROOT, path))) {
      const child = `${path}/${name}`;
      if (statSync(join(ROOT, child)).isDirectory()) walk(child);
      else if (extensions.some((extension) => name.endsWith(extension))) found.push(child);
    }
  };
  walk(dir);
  return found;
}

// S1 - os tokens da door 1

const DOOR_ONE_ROOTS: Array<[string, string]> = [
  ['--status-ok', 'var(--primary)'],
  ['--status-ok-surface', 'rgb(252 244 60 / 0.14)'],
  ['--status-warn', '#f59e0b'],
  ['--status-warn-surface', 'rgb(245 158 11 / 0.14)'],
  ['--status-bad', '#f87171'],
  ['--status-bad-surface', 'rgb(248 113 113 / 0.14)'],
  ['--status-idle', '#a3a3a3'],
  ['--status-idle-surface', '#1a1a1a'],
  ['--muted-strong', '#d4d4d4'],
  ['--chart-off', '#404040'],
  ['--border-control', '#6b6b6b'],
];

const DOOR_ONE_THEME: Array<[string, string]> = [
  ['--color-status-ok', 'var(--status-ok)'],
  ['--color-status-ok-surface', 'var(--status-ok-surface)'],
  ['--color-status-warn', 'var(--status-warn)'],
  ['--color-status-warn-surface', 'var(--status-warn-surface)'],
  ['--color-status-bad', 'var(--status-bad)'],
  ['--color-status-bad-surface', 'var(--status-bad-surface)'],
  ['--color-status-idle', 'var(--status-idle)'],
  ['--color-status-idle-surface', 'var(--status-idle-surface)'],
  ['--color-muted-strong', 'var(--muted-strong)'],
  ['--color-chart-off', 'var(--chart-off)'],
  ['--color-border-control', 'var(--border-control)'],
];

test('status_control_and_chart_tokens_are_the_door_one_literal', () => {
  const css = read(GLOBALS);
  const roots = new Map(declarationsOf(blockOf(css, ':root {')));
  for (const [name, value] of DOOR_ONE_ROOTS) expect(roots.get(name), name).toBe(value);

  const theme = new Map(declarationsOf(blockOf(css, '@theme inline {')));
  for (const [name, value] of DOOR_ONE_THEME) expect(theme.get(name), name).toBe(value);
});

// C2 - a paleta da AD-098 continua intacta

test('theme_keeps_the_ad098_values', () => {
  const roots = new Map(declarationsOf(blockOf(read(GLOBALS), ':root {')));
  const AD_098: Array<[string, string]> = [
    ['--background', '#000000'],
    ['--foreground', '#fafafa'],
    ['--card', '#0f0f0f'],
    ['--muted', '#1a1a1a'],
    ['--muted-foreground', '#a3a3a3'],
    ['--border', '#262626'],
    ['--input', '#2a2a2a'],
    ['--primary', '#fcf43c'],
    ['--ring', '#fcf43c'],
    ['--destructive', '#dc2626'],
    ['--destructive-foreground', '#fafafa'],
    ['--radius', '1rem'],
  ];
  for (const [name, value] of AD_098) expect(roots.get(name), name).toBe(value);
});

// C3 - nenhum literal de cor fora do tema

const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const LEGACY = ['#f87171', '#d4d4d4', '#f59e0b', '#404040', 'rgb(205 247 32)', 'rgb(205, 247, 32)'];

test('no_hex_colors_outside_the_theme', () => {
  const trees = ['apps/web/src', 'packages/ui/src/components'];
  const files = trees.flatMap((tree) => filesOf(tree, ['.ts', '.tsx', '.css', '.json', '.md', '.mjs', '.js', '.txt']));
  expect(files.length).toBeGreaterThan(50);
  for (const path of files) {
    const source = read(path);
    expect(source.match(HEX) ?? [], path).toEqual([]);
    for (const literal of LEGACY) expect(source, `${path}: ${literal}`).not.toContain(literal);
  }
});

// C4 - o mapa literal de 27 pares da door 7

test('status_badge_variant_map_is_the_door_seven_literal', () => {
  const literal = /export const STATUS_VARIANTS = (\{[\s\S]*?\}) as const;/.exec(read(STATUS_BADGE))?.[1];
  expect(literal).toBeDefined();
  const map = new Function(`return (${literal});`)() as Record<string, Record<string, string>>;

  expect(map).toEqual({
    student: { active: 'ok', inactive: 'idle', suspended: 'warn' },
    enrollment: { active: 'ok', scheduled: 'idle', expired: 'warn', cancelled: 'idle' },
    payment: { paid: 'ok', pending: 'warn', overdue: 'bad', cancelled: 'idle' },
    'check-in': { allowed: 'ok', blocked: 'bad' },
    staff: { active: 'ok', inactive: 'idle' },
    lead: { new: 'warn', contacted: 'idle', converted: 'ok', discarded: 'idle' },
    portal: { active: 'ok', pending: 'warn', none: 'idle', disabled: 'idle' },
    user: { active: 'ok', inactive: 'idle' },
    plan: { active: 'ok', inactive: 'idle' },
  });
  const pairs = Object.values(map).reduce((total, statuses) => total + Object.keys(statuses).length, 0);
  expect(pairs).toBe(27);
});

// C5 - o contraste de cada situação e do texto do tema

type Rgb = { r: number; g: number; b: number; a: number };

/** Um valor de cor do tema (`#rrggbb`, `rgb(r g b / a)` ou `var(--x)`) resolvido contra os tokens. */
function colorOf(value: string, tokens: Map<string, string>): Rgb {
  const trimmed = value.trim();
  const variable = /^var\((--[\w-]+)\)$/.exec(trimmed);
  if (variable) {
    const next = tokens.get(variable[1]!);
    expect(next, `${variable[1]} existe`).toBeDefined();
    return colorOf(next!, tokens);
  }
  const hex = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (hex) {
    const digits = hex[1]!;
    return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16), a: 1 };
  }
  const rgb = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\)$/.exec(trimmed);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  throw new Error(`cor não lida: ${value}`);
}

/** A cor da superfície translúcida composta sobre o fundo (o cartão, na door 1). */
function over(surface: Rgb, background: Rgb): Rgb {
  const mix = (front: number, back: number) => front * surface.a + back * (1 - surface.a);
  return { r: mix(surface.r, background.r), g: mix(surface.g, background.g), b: mix(surface.b, background.b), a: 1 };
}

function luminance({ r, g, b }: Rgb) {
  const linear = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(one: Rgb, other: Rgb) {
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

test('status_and_foreground_contrast_meet_the_minimums', () => {
  const css = read(GLOBALS);
  const tokens = new Map(declarationsOf(blockOf(css, ':root {')));
  const card = colorOf(tokens.get('--card')!, tokens);

  for (const tone of ['ok', 'warn', 'bad', 'idle']) {
    const text = colorOf(tokens.get(`--status-${tone}`)!, tokens);
    const surface = over(colorOf(tokens.get(`--status-${tone}-surface`)!, tokens), card);
    expect(contrast(text, surface), `--status-${tone}`).toBeGreaterThanOrEqual(4.5);
  }

  expect(contrast(colorOf(tokens.get('--foreground')!, tokens), colorOf(tokens.get('--background')!, tokens))).toBeGreaterThanOrEqual(7);
});

// C10 - nenhuma tela passa `disabled={isSubmitting}` ao botão

test('no_screen_passes_disabled_is_submitting', () => {
  const files = filesOf('apps/web/src');
  expect(files.length).toBeGreaterThan(100);
  for (const path of files) expect(read(path), path).not.toContain('disabled={isSubmitting}');
});

// C50 - o PAGE_BODY é um corpo simples, sem borda e sem raio

test('page_body_is_a_plain_body_container', () => {
  const body = read('apps/web/src/components/page-body.ts');
  expect(body).toContain("export const PAGE_BODY = 'grid gap-6';");
  // nenhum cartão, borda ou raio: a `Table` não fica dentro de um segundo cartão
  expect(body).not.toMatch(/\bborder\b|\brounded\b|PANEL/);

  const screens = ['students', 'staff', 'plans', 'payments', 'check-ins', 'audit'];
  expect(screens).toHaveLength(6);
  for (const screen of screens) {
    const page = read(`apps/web/src/app/${screen}/page.tsx`);
    expect(page, screen).toContain('className={PAGE_BODY} data-slot="page-body"');
  }
});

// C11 - a borda de controle alcança 3:1 contra o cartão

test('border_control_reaches_three_to_one_on_card', () => {
  const tokens = new Map(declarationsOf(blockOf(read(GLOBALS), ':root {')));
  expect(tokens.get('--border-control')).toBe('#6b6b6b');
  const border = colorOf(tokens.get('--border-control')!, tokens);
  const card = colorOf(tokens.get('--card')!, tokens);
  expect(contrast(border, card)).toBeGreaterThanOrEqual(3);
});

// C13 - o texto de cada badge vem dos mapas de negócio, que não mudam

test('status_badge_text_comes_from_the_label_maps', async () => {
  const [students, plans, payments, leads, roles] = await Promise.all([
    import('../../apps/web/src/lib/students.ts'),
    import('../../apps/web/src/lib/plans.ts'),
    import('../../apps/web/src/lib/payments.ts'),
    import('../../apps/web/src/lib/leads.ts'),
    import('../../apps/web/src/lib/roles.ts'),
  ]);

  expect(students.STATUS_LABELS).toEqual({ active: 'Ativo', inactive: 'Inativo', suspended: 'Suspenso' });
  expect(plans.ENROLLMENT_STATUS_LABELS).toEqual({ scheduled: 'Agendada', active: 'Ativa', expired: 'Vencida', cancelled: 'Cancelada' });
  expect(payments.PAYMENT_STATUS_LABELS).toEqual({ paid: 'Pago', pending: 'Pendente', overdue: 'Atrasado', cancelled: 'Matrícula cancelada' });
  expect(students.PORTAL_LABELS).toEqual({
    none: 'Sem acesso ao portal',
    pending: 'Primeiro acesso pedido',
    active: 'Acesso ativo',
    disabled: 'Acesso desligado',
  });
  expect(plans.PLAN_STATUS_LABELS).toEqual({ active: 'Ativo', inactive: 'Inativo' });
  expect(leads.LEAD_STATUS_LABELS).toEqual({ new: 'Novo', contacted: 'Contatado', converted: 'Matriculado', discarded: 'Descartado' });
  expect(roles.ROLE_LABELS).toEqual({
    admin: 'Administrador',
    reception: 'Recepção',
    hr_finance: 'RH/Financeiro',
    instructor: 'Instrutor',
    student: 'Aluno',
  });

  // o badge não carrega um texto de situação: o rótulo é sempre o mapa de quem o monta
  const badge = read(STATUS_BADGE);
  const labels = [
    ...Object.values(students.STATUS_LABELS),
    ...Object.values(plans.ENROLLMENT_STATUS_LABELS),
    ...Object.values(payments.PAYMENT_STATUS_LABELS),
    ...Object.values(students.PORTAL_LABELS),
    ...Object.values(plans.PLAN_STATUS_LABELS),
    ...Object.values(leads.LEAD_STATUS_LABELS),
  ];
  for (const label of labels) expect(badge, label).not.toContain(label);
  // e o portal do aluno alimenta o badge com o mapa de pagamento
  expect(read('apps/web/src/app/minha-conta/page.tsx')).toContain('PAYMENT_STATUS_LABELS[');
});

// C44 - o esqueleto do portal não monta a shell da equipe

test('portal_loading_does_not_mount_the_team_shell', () => {
  const loading = read('apps/web/src/app/minha-conta/loading.tsx');
  expect(loading.trim()).toBe("export { PortalLoading as default } from '../../components/portal-loading.tsx';");

  const skeleton = read('apps/web/src/components/portal-loading.tsx');
  expect(skeleton).toContain('export function PortalLoading()');
  expect(skeleton).toContain('<PageSkeleton');
  // sem a barra lateral nem a barra inferior que o `AppLoading` da equipe desenha
  expect(skeleton).not.toContain('AppLoading');
  expect(skeleton).not.toContain('skeleton-side');
  expect(skeleton).not.toContain('skeleton-bottom-bar');
  expect(skeleton).not.toContain('side-nav');
  expect(skeleton).not.toContain('bottom-nav');
  // a mesma coluna do portal: um cabeçalho, o bloco de identidade e três cartões
  expect(skeleton).toContain('max-w-3xl');
  expect(skeleton).toMatch(/length: 3/);
});
