/**
 * O que de um erro pode ir para o log. A mensagem de um erro de consulta do Drizzle termina com os
 * parâmetros da consulta - o e-mail digitado no login, o token da sessão -, e o `stack` começa pela
 * mensagem. Aqui sai o nome, a consulta sem os parâmetros, os quadros da pilha e a causa.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return typeof error === 'string' ? withoutParams(error) : '[omitido]';

  const message = 'query' in error && 'params' in error ? `Failed query: ${String(error.query)}` : withoutParams(error.message);
  const frames = (error.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line));
  const cause = error.cause === undefined ? [] : [`[cause] ${describeError(error.cause)}`];
  return [`${error.name}: ${message}`, ...frames, ...cause].join('\n');
}

/** A mesma mensagem do Drizzle, quando chega já como texto dentro de outro erro. */
function withoutParams(text: string): string {
  return text.replace(/\nparams: [\s\S]*$/, '\nparams: [omitidos]');
}

/**
 * Uma linha de log em JSON para o que o Better Auth registra. Só o texto e os erros entram, pelo
 * `describeError`; os objetos que ele anexa (dados da requisição) ficam de fora.
 */
export function logBetterAuth(level: string, message: unknown, ...args: unknown[]) {
  const errors = args.filter((arg) => arg instanceof Error).map(describeError);
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(
    JSON.stringify({
      level,
      time: new Date().toISOString(),
      msg: 'better-auth',
      detail: describeError(message),
      ...(errors.length > 0 && { errors }),
    }) + '\n',
  );
}
