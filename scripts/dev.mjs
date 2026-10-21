// Orquestrador do `pnpm dev`: sobe a API e o web em watch e prefixa cada linha com [api] em verde e
// [web] em azul. Sem dependência nova: o processo inteiro usa só módulos do Node.
//
// Ctrl+C encerra os dois (no Windows, pela árvore de processos); se um sair sozinho, o outro também
// sai, para o terminal não ficar com metade da stack de pé.

import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const GREEN = '\u001b[32m';
const BLUE = '\u001b[34m';
const RESET = '\u001b[39m';

const PROCESSES = [
  { script: 'dev:api', label: '[api]', color: GREEN },
  { script: 'dev:web', label: '[web]', color: BLUE },
];

/** O pnpm que chamou este script; rodar direto `node scripts/dev.mjs` não tem o que orquestrar. */
const pnpm = process.env.npm_execpath;
if (!pnpm) {
  console.error('dev: rode por "pnpm dev" (npm_execpath não definido)');
  process.exit(1);
}

/** No Windows o `npm_execpath` é o `pnpm-native.exe`; nos demais, o `pnpm.js` roda com o `node`. */
const launch = (script) =>
  pnpm.toLowerCase().endsWith('.exe') ? [pnpm, [script]] : [process.execPath, [pnpm, script]];

/** Cada linha do filho sai com o rótulo colorido; linhas quebradas em pedaços são remontadas. */
function prefix(stream, prelude) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) process.stdout.write(`${prelude}${line}\n`);
  });
  stream.on('end', () => {
    if (buffer) process.stdout.write(`${prelude}${buffer}\n`);
  });
}

function start({ script, label, color }) {
  const [command, args] = launch(script);
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const prelude = `${color}${label}${RESET} `;
  prefix(child.stdout, prelude);
  prefix(child.stderr, prelude);
  return child;
}

let stopping = false;

function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) kill(child);
  setTimeout(() => process.exit(code), 100).unref();
}

const children = PROCESSES.map(start);

for (const child of children) {
  child.on('error', (error) => {
    console.error(`dev: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 0));
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}
