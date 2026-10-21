import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

/**
 * As provas dos comandos de desenvolvimento: banco e armazenamento em container, API e web na
 * máquina em watch. A prova é de fiação - o arquivo que declara o comando, o processo e o
 * container -; o comportamento foi conferido no smoke do Build.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function scriptsOf(path: string): Record<string, string> {
  const { scripts } = JSON.parse(read(path)) as { scripts: Record<string, string> };
  return scripts;
}

const rootScripts = () => scriptsOf('package.json');

/** Os comandos `pnpm <script>` que o README mostra dentro de código. */
function pnpmScriptsInCode(text: string): string[] {
  const snippets = [
    ...text.matchAll(/```[\s\S]*?```/g),
    ...text.matchAll(/`[^`\n]+`/g),
  ].map((match) => match[0]);
  return [
    ...new Set(
      snippets.flatMap((snippet) =>
        [...snippet.matchAll(/pnpm ([a-z][a-z0-9:-]*)/g)].map((match) => match[1]!),
      ),
    ),
  ];
}

test('dev_setup_installs_and_creates_the_env_file_once', () => {
  const scripts = rootScripts();
  expect(scripts.setup).toContain('pnpm install');
  expect(scripts.setup).toContain('pnpm dev:db');
  expect(scripts['dev:db']).toContain('node scripts/dev-setup.mjs');

  const setup = read('scripts/dev-setup.mjs');
  // a cópia do `.env.example` vem depois da checagem, dentro do caminho em que o `.env` não existe
  const check = setup.indexOf('existsSync(envFile)');
  const copy = setup.indexOf('copyFileSync(exampleFile, envFile)');
  expect(check).toBeGreaterThan(-1);
  expect(copy).toBeGreaterThan(check);
  expect(setup).toContain("'.env.example'");
  expect(setup).toMatch(
    /if \(existsSync\(envFile\)\) \{\s*(?:\/\/[^\n]*\n\s*)?\} else \{\s*copyFileSync\(exampleFile, envFile\)/,
  );
});

test('dev_db_starts_only_the_database_and_storage', () => {
  const db = rootScripts()['dev:db']!;
  expect(db).toMatch(/docker compose up -d --wait postgres storage( |$)/);
  expect(db).toContain('docker compose run --rm storage-init');
  expect(db).toContain('pnpm db:migrate');

  // a API e o web não sobem em container nesse modo
  expect(db).not.toMatch(/\bapi\b/);
  expect(db).not.toMatch(/\bweb\b/);
});

test('api_dev_script_watches_and_reloads_the_built_api', () => {
  const api = scriptsOf('apps/api/package.json');
  expect(api.dev).toContain('node ../../scripts/dev-setup.mjs');
  expect(api.dev).toContain('node --env-file-if-exists=../../.env');
  expect(api.dev).toContain('build.mjs --watch');

  const build = read('apps/api/build.mjs');
  expect(build).toContain('await context(options)');
  expect(build).toContain('await ctx.watch()');
  expect(build).toContain('build.onEnd(');
  expect(build).toContain("spawn(process.execPath, ['dist/main.js']");
  // o watcher reinicia pela recompilação bem-sucedida, não por um watcher do Node em node_modules
  expect(build).toMatch(
    /build\.onEnd\(\(result\) => \{\s*if \(result\.errors\.length === 0\) start\(\);/,
  );
  expect(build).not.toContain("['--watch'");
});

test('web_dev_script_runs_next_dev_with_the_root_env_file', () => {
  const web = scriptsOf('apps/web/package.json');
  expect(web.dev).toContain('node ../../scripts/dev-setup.mjs');
  expect(web.dev).toContain('node ../../scripts/dev-web.mjs');

  // o lançador carrega o `.env` da raiz no processo e o `next dev` herda o ambiente
  const launcher = read('scripts/dev-web.mjs');
  expect(launcher).toContain('loadEnvFile');
  expect(launcher).toContain("'dev', '-p', '3000'");
  expect(launcher).toContain('cwd: appDir');
  expect(launcher).toContain('env: process.env');
  expect(existsSync(join(ROOT, 'apps/web/node_modules/next/dist/bin/next'))).toBe(true);

  // o `.env` carregado aponta o web para a API da máquina
  expect(read('.env.example')).toMatch(/^API_URL=http:\/\/localhost:3001$/m);
});

test('dev_script_runs_the_api_in_green_and_the_web_in_blue', () => {
  const dev = rootScripts().dev!;
  expect(dev).toContain('pnpm dev:db &&');
  expect(dev).toContain('node scripts/dev.mjs');

  const orchestrator = read('scripts/dev.mjs');
  expect(orchestrator).toContain("'dev:api'");
  expect(orchestrator).toContain("'dev:web'");
  expect(orchestrator).toContain("label: '[api]'");
  expect(orchestrator).toContain("label: '[web]'");
  expect(orchestrator).toContain('\\u001b[32m');
  expect(orchestrator).toContain('\\u001b[34m');
  // sobe os scripts pelo pnpm que chamou o orquestrador, sem shell no meio
  expect(orchestrator).toContain('npm_execpath');
  // um processo saindo derruba o outro, e o Ctrl+C encerra os dois
  expect(orchestrator).toMatch(/child\.on\('exit', \(code\) => stop\(code \?\? 0\)\)/);
  expect(orchestrator).toContain("'taskkill'");
});

test('dev_orchestrator_uses_only_the_node_standard_library', () => {
  const source = read('scripts/dev.mjs');
  const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]!);
  expect(imports.length).toBeGreaterThan(0);
  for (const name of imports) {
    expect(name.startsWith('node:'), `dependência fora do Node em dev.mjs: ${name}`).toBe(true);
  }
});

test('readme_documents_the_local_development_commands', () => {
  const text = read('README.md');
  expect(text).toContain('## Desenvolvimento local');

  const named = new Set(pnpmScriptsInCode(text));
  for (const name of ['setup', 'dev', 'dev:db', 'dev:api', 'dev:web']) {
    expect(named, `README cita "pnpm ${name}"`).toContain(name);
  }
  // o modo separa o que fica em container do que roda na máquina, e nas portas da API e do web
  expect(text).toMatch(/container/);
  expect(text).toContain('3001');
  expect(text).toContain('3000');
});
