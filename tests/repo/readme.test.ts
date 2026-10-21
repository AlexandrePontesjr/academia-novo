import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';

/**
 * As provas da documentação da raiz: o README que um leitor novo abre primeiro. Cada fato que ele
 * afirma sobre o repositório tem uma asserção aqui, e `pnpm verify` roda esta suíte.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const readme = () => read('README.md');

const ROOT_SCRIPTS = ['verify', 'db:migrate', 'users:create-admin', 'test:stack'];
const REQUIRED_LINKS = [
  'PRD — Sistema de Gestão de Academia.md',
  '.specs/ROADMAP.md',
  '.specs/STATE.md',
  'deploy/README.md',
  '.env.example',
];

/** Todo comando `pnpm <script>` que o README mostra dentro de código (não em prosa). */
function pnpmScriptsInCode(text: string): string[] {
  const snippets = [
    ...text.matchAll(/```[\s\S]*?```/g),
    ...text.matchAll(/`[^`\n]+`/g),
  ].map((match) => match[0]);
  const builtins = new Set(['install', 'exec']);
  return [
    ...new Set(
      snippets.flatMap((snippet) =>
        [...snippet.matchAll(/pnpm ([a-z][a-z0-9:-]*)/g)]
          .map((match) => match[1]!)
          .filter((name) => !builtins.has(name)),
      ),
    ),
  ];
}

test('readme_exists_with_the_project_title', () => {
  expect(existsSync(join(ROOT, 'README.md'))).toBe(true);

  const lines = readme().split(/\r?\n/);
  expect(lines[0]).toBe('# academia-bairro');
  expect(readme()).toContain('Sistema web de gestão');
});

test('readme_names_only_root_scripts_that_exist', () => {
  const root = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const text = readme();

  for (const name of pnpmScriptsInCode(text)) {
    expect(Object.keys(root.scripts), `README cita "pnpm ${name}", que não é script da raiz`).toContain(name);
  }
  for (const name of ROOT_SCRIPTS) {
    expect(text, name).toContain(`pnpm ${name}`);
  }
});

test('readme_states_the_node_and_pnpm_versions_from_the_manifests', () => {
  const root = JSON.parse(read('package.json')) as {
    engines: { node: string };
    packageManager: string;
  };
  const text = readme();

  const nodeMajor = /(\d+)/.exec(root.engines.node)?.[1];
  const pnpmVersion = /^pnpm@(.+)$/.exec(root.packageManager)?.[1];
  expect(nodeMajor, 'engines.node').toBeDefined();
  expect(pnpmVersion, 'packageManager').toBeDefined();

  expect(text).toContain(`Node.js ${nodeMajor!}`);
  expect(text).toContain(`pnpm ${pnpmVersion!}`);
});

test('readme_relative_links_resolve_to_existing_paths', () => {
  const targets = [...readme().matchAll(/\[[^\]]*\]\((<[^>]+>|[^)\s]+)\)/g)]
    .map((match) => match[1]!)
    .map((target) => (target.startsWith('<') ? target.slice(1, -1) : target))
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.replace(/#.*$/, ''));

  for (const target of targets) {
    expect(existsSync(join(ROOT, target)), `link relativo quebrado: ${target}`).toBe(true);
  }
  for (const required of REQUIRED_LINKS) {
    expect(targets, `o README precisa linkar ${required}`).toContain(required);
  }
});

test('readme_documents_the_ports_of_the_env_example', () => {
  const env = read('.env.example');
  const value = (key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(env)?.[1]?.trim();
  const webPort = value('WEB_PORT');
  const apiPort = value('PORT');
  expect(webPort, 'WEB_PORT').toBeDefined();
  expect(apiPort, 'PORT').toBeDefined();

  expect(readme()).toContain(`http://localhost:${webPort!}`);
  expect(readme()).toContain(`http://localhost:${apiPort!}/health`);
});

test('readme_documents_the_first_administrator_command', () => {
  const text = readme();

  expect(text).toContain('docker compose exec');
  expect(text).toContain('pnpm users:create-admin');
  expect(text).toContain('ADMIN_PASSWORD');
  expect(text).toMatch(/12 a 128 caracteres/);
});

test('readme_covers_every_workspace_directory', () => {
  const { packages } = parseYaml(read('pnpm-workspace.yaml')) as { packages: string[] };
  const dirs = packages.flatMap((pattern) => {
    expect(pattern).toMatch(/^[\w-]+\/\*$/);
    const parent = pattern.slice(0, -2);
    return readdirSync(join(ROOT, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, parent, entry.name, 'package.json')))
      .map((entry) => `${parent}/${entry.name}`);
  });

  for (const dir of [...dirs, 'deploy']) {
    expect(existsSync(join(ROOT, dir)), dir).toBe(true);
    expect(readme(), `o README precisa citar ${dir}`).toContain(dir);
  }
});
