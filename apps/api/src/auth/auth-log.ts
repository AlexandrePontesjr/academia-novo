import type { Response } from 'express';

export type AuthEvent = 'auth.login_succeeded' | 'auth.login_failed' | 'auth.login_blocked';

/**
 * Uma linha de log por desfecho de login. Só o que identifica o evento: nunca o e-mail digitado,
 * a senha, o código nem o cookie.
 */
export function logAuth(res: Response, msg: AuthEvent, userId?: string) {
  process.stdout.write(
    JSON.stringify({
      level: 'info',
      time: new Date().toISOString(),
      msg,
      requestId: String(res.locals.requestId),
      ...(userId && { userId }),
    }) + '\n',
  );
}
