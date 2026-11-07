import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vitest';

/** Os testes de repositório da `motion`: as regras sobre arquivos que nenhum elemento renderizado mostra. */

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const MOTION_FILE = 'packages/ui/src/motion.tsx';
const LAYOUT = 'apps/web/src/app/layout.tsx';
const TREES = ['apps/web/src', 'packages/ui/src'];

/** Todo `.ts`/`.tsx` (ou, com `extensions`, outro tipo) das duas árvores, como caminho relativo à raiz. */
function filesOf(extensions = ['.ts', '.tsx']) {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const path = `${dir}/${name}`;
      if (statSync(join(ROOT, path)).isDirectory()) walk(path);
      else if (extensions.some((extension) => name.endsWith(extension))) found.push(path);
    }
  };
  TREES.forEach(walk);
  return found;
}

/** O corpo de uma função exportada, da assinatura até a chave que a fecha. */
function bodyOf(source: string, name: string) {
  const start = source.indexOf(`export function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const open = source.indexOf('{\n', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }
  throw new Error(`${name} sem fim`);
}

// S1 - fundação de movimento e dependência

test('motion_provider_is_motion_config_user_without_a_host_element', () => {
  const body = bodyOf(read(MOTION_FILE), 'MotionProvider');
  expect(body).toContain('<MotionConfig reducedMotion="user" transition={{ duration: MOTION.base, ease: MOTION.ease }}>');
  // nenhuma tag de elemento do DOM (minúscula) no corpo: o provider não acrescenta nó
  expect(body.match(/<[a-z][\w-]*[\s>/]/g) ?? []).toEqual([]);

  const layout = read(LAYOUT);
  expect(layout).toContain("import { MotionProvider } from '@academia/ui';");
  expect(layout).toMatch(/<body>\s*<MotionProvider>\{children\}<\/MotionProvider>\s*<\/body>/);
});

test('motion_tokens_are_the_door_one_literal', () => {
  const source = read(MOTION_FILE);
  const literal = /export const MOTION = (\{[\s\S]*?\}) as const;/.exec(source)?.[1];
  expect(literal).toBeDefined();
  const tokens = new Function(`return (${literal});`)() as unknown;
  expect(tokens).toEqual({ micro: 0.15, base: 0.2, long: 0.3, ease: [0.2, 0.8, 0.2, 1], distance: 8, distanceDesktop: 12, stagger: 0.04, staggerMax: 8 });
  expect(source.match(/export const MOTION\b/g)).toHaveLength(1);
});

test('motion_props_read_durations_and_distances_from_the_tokens', () => {
  const users = filesOf().filter((path) => path !== MOTION_FILE && /from 'motion\/react(?:-client)?'/.test(read(path)));
  for (const path of users) {
    const source = read(path);
    const literals = [
      ...source.matchAll(/\b(duration|delay|ease|staggerChildren|delayChildren|x|y)\s*:\s*(-?[\d.]|\[)/g),
      ...source.matchAll(/\b(duration|delay|ease|staggerChildren|delayChildren|x|y)=\{\s*(-?[\d.]|\[)/g),
    ].map((match) => match[0]);
    expect(literals, path).toEqual([]);
  }
});

test('motion_imports_only_from_motion_react', () => {
  const imports = filesOf().flatMap((path) =>
    [...read(path).matchAll(/(?:from|import)\s*\(?\s*'((?:motion|framer-motion)[^']*)'/g)].map((match) => `${path} ${match[1]}`),
  );
  expect(imports.length).toBeGreaterThan(0);
  for (const entry of imports) expect(entry).toMatch(/ motion\/react(?:-client)?$/);
  for (const path of filesOf(['.ts', '.tsx', '.css', '.js', '.mjs', '.json'])) {
    expect(read(path), relative(ROOT, join(ROOT, path))).not.toContain('framer-motion');
  }
});

test('the_dukfit_dependency_guard_is_gone', () => {
  const guard = read('tests/repo/identidade.test.ts');
  expect(guard).toContain("test('motion_is_the_only_added_dependency'");
  expect(guard).not.toContain('dukfit_adds_no_npm_dependency');
  expect(guard).not.toContain('DUKFIT_BASE');
});

// S3 - carregamento

// `leads` entrou com a `pre-cadastro`: todo segmento novo do shell ganha o mesmo carregamento (AD-101).
// `minha-conta` saiu com o portal do aluno: a tela tem o próprio esqueleto (refino visual, C44).
const SEGMENTS = ['dashboard', 'students', 'staff', 'plans', 'payments', 'check-in', 'check-ins', 'audit', 'users', 'privacy', 'account', 'leads'];
const GLOBALS = 'packages/ui/src/globals.css';

/** O bloco de um `@keyframes`, da chave que abre até a que fecha. */
function keyframesOf(css: string, name: string) {
  const start = css.indexOf(`@keyframes ${name} {`);
  expect(start, name).toBeGreaterThan(-1);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  throw new Error(`${name} sem fim`);
}

test.each(SEGMENTS)('segment_has_app_loading: %s', (segment) => {
  const source = read(`apps/web/src/app/${segment}/loading.tsx`);
  expect(source.trim()).toBe("export { AppLoading as default } from '../../components/app-loading.tsx';");
  expect(read('apps/web/src/components/app-loading.tsx')).toContain('export function AppLoading()');
});

test('twelve_segments_have_app_loading', () => {
  expect(SEGMENTS).toHaveLength(12);
  const all = readdirSync(join(ROOT, 'apps/web/src/app'), { recursive: true, encoding: 'utf8' }).filter((path) => /(^|[\\/])loading\.tsx$/.test(path));
  // o portal do aluno tem `loading.tsx` próprio, fora do `AppLoading` da equipe (refino visual, C44)
  expect(all.map((path) => path.split(/[\\/]/)[0]).sort()).toEqual([...SEGMENTS, 'minha-conta'].sort());
});

test('skeleton_pulse_keyframes_are_the_door_three_literal', () => {
  const css = read(GLOBALS);
  const frames = keyframesOf(css, 'skeleton-pulse');
  expect([...frames.matchAll(/opacity: ([\d.]+);/g)].map((match) => Number(match[1])).sort()).toEqual([0.35, 0.7]);
  expect(css).toMatch(/\[data-slot='skeleton'\] \{\n {2}animation: skeleton-pulse 1\.4s [^;]*infinite;/);
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('@keyframes skeleton-pulse')));
  expect(reduced).toMatch(/\[data-slot='skeleton'\] \{\n {4}animation: none;\n {4}opacity: 0\.5;/);
});

test('no_skeleton_on_landing_login_or_two_factor', () => {
  for (const dir of ['apps/web/src/app', 'apps/web/src/app/login', 'apps/web/src/app/login/two-factor', 'apps/web/src/app/two-factor/setup']) {
    const names = readdirSync(join(ROOT, dir));
    expect(names, dir).not.toContain('loading.tsx');
    expect(names, dir).not.toContain('template.tsx');
  }
});

// S4 - ações

/** Os 14 arquivos que tinham `disabled={pending}` em `7471232` (Coverage, "pending controls"). */
const PENDING_FILES = [
  'apps/web/src/app/check-in/check-in-desk.tsx',
  'apps/web/src/app/check-ins/report-table.tsx',
  'apps/web/src/app/plans/[id]/edit/plan-status-actions.tsx',
  'apps/web/src/app/privacy/privacy-form.tsx',
  'apps/web/src/app/staff/[id]/status-actions.tsx',
  'apps/web/src/app/staff/[id]/user-link.tsx',
  'apps/web/src/app/students/[id]/check-ins-block.tsx',
  'apps/web/src/app/students/[id]/consents-block.tsx',
  'apps/web/src/app/students/[id]/enrollments-block.tsx',
  'apps/web/src/app/students/[id]/payments-block.tsx',
  'apps/web/src/app/students/[id]/status-actions.tsx',
  'apps/web/src/app/users/users-panel.tsx',
  'apps/web/src/components/privacy/privacy-block.tsx',
  'apps/web/src/components/sign-out-button.tsx',
];

test('pending_controls_use_busy', () => {
  expect(PENDING_FILES).toHaveLength(14);
  for (const path of filesOf().filter((file) => file.startsWith('apps/web/src/'))) {
    expect(read(path), path).not.toContain('disabled={pending}');
  }
  for (const path of PENDING_FILES) expect(read(path), path).toContain('busy={pending}');
});

/** As declarações de um bloco CSS como pares `[propriedade, valor]`. */
const declarationsOf = (block: string) =>
  [...block.matchAll(/([a-z-]+):\s*([^;{}]+);/g)].map((match) => [match[1]!, match[2]!.trim()] as const);

test('action_keyframes_are_the_door_five_literal', () => {
  const css = read(GLOBALS);
  expect(keyframesOf(css, 'overlay-in')).toMatch(/from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 1;\s*\}/);
  expect(keyframesOf(css, 'dialog-in')).toMatch(/from \{\s*opacity: 0;\s*transform: scale\(0\.98\);\s*\}\s*to \{\s*opacity: 1;\s*transform: scale\(1\);\s*\}/);
  expect(css).toContain("[data-slot='dialog-overlay'][data-state='open'] {\n  animation: overlay-in 150ms var(--motion-ease);\n}");
  expect(css).toContain("[data-slot='dialog-content'][data-state='open'] {\n  animation: dialog-in 200ms var(--motion-ease);\n}");
  expect(css).toMatch(/\[role='alert'\],\n\[data-motion='feedback'\] \{\n {2}animation: feedback-in 180ms var\(--motion-ease\);\n\}/);
  expect(css).toMatch(/\.pressable:active \{\n {2}transform: scale\(0\.98\);\n\}/);
  expect(css).toContain('--motion-ease: cubic-bezier(0.2, 0.8, 0.2, 1);');
});

test('action_animations_touch_only_opacity_transform_background', () => {
  const css = read(GLOBALS);
  for (const name of ['overlay-in', 'dialog-in', 'feedback-in']) {
    const properties = new Set(declarationsOf(keyframesOf(css, name)).map(([property]) => property));
    expect([...properties].sort(), name).toEqual(name === 'overlay-in' ? ['opacity'] : ['opacity', 'transform']);
  }
  const pressable = /\.pressable \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const transition = declarationsOf(pressable).find(([property]) => property === 'transition')?.[1] ?? '';
  expect(transition.split(',').map((part) => part.trim().split(/\s+/)[0])).toEqual(['transform', 'background-color']);

  // as regras desta feature: do bloco de movimento até a impressão
  const added = css.slice(css.indexOf('/* Movimento (motion'), css.indexOf('/* A impressão'));
  expect(added.length).toBeGreaterThan(200);
  const banned = /^(top|left|width|height|margin(-\w+)?)$/;
  for (const [property, value] of declarationsOf(added)) {
    if (property === 'transition' || property === 'transition-property') {
      for (const part of value.split(',')) expect(part.trim().split(/\s+/)[0], value).not.toMatch(banned);
    }
    // um `@keyframes` só move o que declara: nada de geometria
    expect(property, value).not.toMatch(banned);
  }
});

/** As regras de um bloco CSS sem aninhamento, como `{ selector, declarations }`. */
function rulesOf(block: string) {
  return [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1]!
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    declarations: declarationsOf(match[2]!),
  }));
}

/** O corpo do `@media (prefers-reduced-motion: reduce)` do movimento (door 5), da chave que abre até a que fecha. */
function reducedMotionBlockOf(css: string) {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('/* Movimento (motion'));
  expect(start, 'bloco de movimento reduzido').toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  throw new Error('@media de movimento reduzido sem fim');
}

test('reduced_motion_block_turns_off_every_door_five_rule', () => {
  const rules = rulesOf(reducedMotionBlockOf(read(GLOBALS)));
  const bySelector = new Map(rules.map((rule) => [rule.selector, rule.declarations]));
  // o bloco tem exatamente as regras que a door 5 nomeia, nenhuma a mais e nenhuma a menos
  expect([...bySelector.keys()]).toEqual([
    '.pressable, .pressable:active',
    "[data-slot='dialog-overlay'][data-state='open'], [data-slot='dialog-content'][data-state='open'], [data-slot='spinner']",
    "[data-slot='skeleton']",
    "[role='alert'], [data-motion='feedback']",
  ]);
  expect(bySelector.get('.pressable, .pressable:active')).toEqual([
    ['transition', 'none'],
    ['transform', 'none'],
  ]);
  expect(bySelector.get("[data-slot='dialog-overlay'][data-state='open'], [data-slot='dialog-content'][data-state='open'], [data-slot='spinner']")).toEqual([
    ['animation', 'none'],
  ]);
  expect(bySelector.get("[data-slot='skeleton']")).toEqual([
    ['animation', 'none'],
    ['opacity', '0.5'],
  ]);
  expect(bySelector.get("[role='alert'], [data-motion='feedback']")).toEqual([
    ['animation', 'none'],
    ['transition', 'none'],
    ['transform', 'none'],
  ]);
});

// S7 - menu flutuante da landing

test('site_header_reads_every_text_from_site', () => {
  const header = read('apps/web/src/components/landing/site-header.tsx');
  expect(header).toContain("import { SITE } from '../../app/site-content.ts';");
  // texto entre tags: o que sobra de `>texto<` que não é expressão nem espaço (o `>` de uma `=>` não fecha tag)
  const between = [...header.matchAll(/(?<!=)>([^<>{}]*)</g)].map((match) => match[1]!.trim()).filter((text) => /[A-Za-zÀ-ú]/.test(text));
  expect(between).toEqual([]);
  // linhas de JSX que são texto puro (nem tag, nem expressão, nem código)
  const jsxText = header
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-zÀ-ú@][^=();<>{}]*$/.test(line) && !line.startsWith('//') && !/^(return|const|export|import|type|interface|if|for)\b/.test(line));
  expect(jsxText).toEqual([]);
  // atributos que a pessoa lê: nenhum literal
  expect(header).not.toMatch(/(?:alt|aria-label|title|placeholder)="[^"]+"/);
  for (const key of ['SITE.menu.open', 'SITE.menu.close', 'SITE.menu.title', 'SITE.labels.nav', 'SITE.logo.alt']) expect(header, key).toContain(key);
});
