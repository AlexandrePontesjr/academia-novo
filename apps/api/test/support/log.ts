import { vi } from 'vitest';

/** Tudo o que o processo escreve em stdout, stderr e `console` a partir daqui; desfaz com `vi.restoreAllMocks()`. */
export function captureOutput() {
  const chunks: string[] = [];
  const capture = (chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  // o Vitest intercepta o `console` antes de ele chegar a stdout/stderr: capturado à parte
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      chunks.push(`${args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' ')}\n`);
    });
  }
  return { text: () => chunks.join('') };
}
