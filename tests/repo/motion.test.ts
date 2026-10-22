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
