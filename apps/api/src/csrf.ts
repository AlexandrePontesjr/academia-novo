import type { NextFunction, Request, Response } from 'express';
import { sendProblem } from './problem.filter.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * O roteador do Express não diferencia maiúsculas: `/API/auth/login` chega à mesma rota que
 * `/api/auth/login`, e a checagem tem de valer para os dois.
 */
const UNDER_API = /^\/api(\/|$)/i;

/**
 * Checagem de origem (AD-020): uma escrita em `/api` só passa se vier da origem do web. Quando o
 * navegador não manda `Origin`, vale o `Sec-Fetch-Site: same-origin`, que uma página não forja.
 */
export function csrfProtection(webOrigin: string) {
  const allowed = new URL(webOrigin).origin;
  return (req: Request, res: Response, next: NextFunction) => {
    if (!UNDER_API.test(req.path) || SAFE_METHODS.has(req.method)) return next();

    const origin = req.headers.origin;
    const sameOrigin =
      origin === undefined ? req.headers['sec-fetch-site'] === 'same-origin' : origin === allowed;
    if (sameOrigin) return next();
    sendProblem(res, 403, 'csrf_rejected');
  };
}
