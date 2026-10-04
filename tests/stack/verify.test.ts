import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { cleanClone, removeClone, run } from './support.ts';

interface TaskSummary {
  taskId: string;
  command: string;
  execution?: { exitCode: number };
}

let clone: string;
let install: ReturnType<typeof run>;
let verify: ReturnType<typeof runVerify>;

/** Roda `pnpm verify` no clone e lê o resumo que o Turborepo grava das tarefas executadas. */
function runVerify() {
  const runsDir = join(clone, '.turbo/runs');
  rmSync(runsDir, { recursive: true, force: true });
  const result = run('pnpm verify', clone, { TURBO_RUN_SUMMARY: 'true' });
  const [summaryFile] = readdirSync(runsDir);
  const summary = JSON.parse(readFileSync(join(runsDir, summaryFile!), 'utf8')) as { tasks: TaskSummary[] };
  return { ...result, tasks: summary.tasks };
}

beforeAll(() => {
  clone = cleanClone();
  install = run('pnpm install --frozen-lockfile', clone);
  verify = runVerify();
}, 1_800_000);

afterAll(() => removeClone(clone));

test('verify_exits_zero_on_clean_clone', () => {
  expect(install.status, install.output.slice(-4000)).toBe(0);
  expect(verify.status, verify.output.slice(-8000)).toBe(0);
});

test('verify_runs_four_tasks_across_workspaces', () => {
  const expected = [
    ...['lint', 'typecheck', 'test', 'build'].flatMap((task) =>
      ['@academia/api', '@academia/web'].map((workspace) => `${workspace}#${task}`),
    ),
    ...['lint', 'typecheck', 'test'].flatMap((task) =>
      ['@academia/contracts', '@academia/database'].map((workspace) => `${workspace}#${task}`),
    ),
  ];
  expect(expected).toHaveLength(14);

  for (const taskId of expected) {
    const task = verify.tasks.find((t) => t.taskId === taskId);
    expect(task, `${taskId} no resumo do verify`).toBeDefined();
    // o Turborepo lista com `<NONEXISTENT>` a tarefa de um workspace que não tem o script
    expect(task?.command, `${taskId} tem script`).not.toBe('<NONEXISTENT>');
    expect(task?.command, `${taskId} tem script`).toMatch(/\S/);
    expect(task?.execution?.exitCode, `${taskId} executou`).toBe(0);
  }
});

test(
  'verify_fails_on_each_broken_task',
  () => {
    const faults = [
      {
        taskId: '@academia/contracts#lint',
        file: 'packages/contracts/src/injected-lint.ts',
        content: 'const unused = 1;\nexport {};\n',
      },
      {
        taskId: '@academia/contracts#typecheck',
        file: 'packages/contracts/src/injected-type.ts',
        content: "export const notANumber: number = 'texto';\n",
      },
      {
        taskId: '@academia/contracts#test',
        file: 'packages/contracts/test/injected.test.ts',
        content:
          "import { expect, test } from 'vitest';\n\ntest('falha injetada', () => {\n  expect(1).toBe(2);\n});\n",
      },
      {
        taskId: '@academia/web#build',
        file: 'apps/web/src/app/injected/page.tsx',
        content:
          "export default function Injected(): never {\n  throw new Error('falha de build injetada');\n}\n",
      },
    ];

    for (const { taskId, file, content } of faults) {
      const path = join(clone, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      try {
        const broken = runVerify();

        expect(broken.status, `verify com ${taskId} quebrada`).not.toBe(0);
        expect(broken.status, `verify com ${taskId} quebrada`).not.toBeNull();
        // a falha é a da tarefa injetada, não um efeito colateral em outra
        const failed = broken.tasks.filter((t) => t.execution && t.execution.exitCode !== 0);
        expect(failed.map((t) => t.taskId), broken.output.slice(-4000)).toEqual([taskId]);
      } finally {
        rmSync(path, { force: true });
      }
    }
  },
  1_800_000,
);

test(
  'verify_fails_below_70_percent_coverage',
  () => {
    // funções exportadas que nenhum teste chama, em número bastante para levar a cobertura de
    // `apps/api/src` para muito abaixo de 70%; o arquivo passa no lint e no typecheck
    const path = join(clone, 'apps/api/src/injected-uncovered.ts');
    const content = Array.from(
      { length: 1500 },
      (_, index) =>
        `export function uncovered${index}(value: number): number {\n` +
        `  if (value > ${index}) return value - ${index};\n` +
        `  return value + ${index};\n` +
        `}\n`,
    ).join('\n');
    writeFileSync(path, content);
    try {
      const broken = runVerify();

      expect(broken.status).not.toBe(0);
      expect(broken.status).not.toBeNull();
      const failed = broken.tasks.filter((t) => t.execution && t.execution.exitCode !== 0);
      expect(failed.map((t) => t.taskId), broken.output.slice(-4000)).toEqual(['@academia/api#test']);
      expect(broken.output).toMatch(/coverage for (lines|branches)[^\n]*does not meet[^\n]*threshold/i);
    } finally {
      rmSync(path, { force: true });
    }
  },
  1_800_000,
);
