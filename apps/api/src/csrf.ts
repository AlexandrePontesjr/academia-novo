import type { NextFunction, Request, Response } from 'express';
import { sendProblem } from './problem.filter.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Checagem de origem (AD-020): uma escrita em `/api` só passa se vier da origem do web. Quando o
 * navegador não manda `Origin`, vale o `Sec-Fetch-Site: same-origin`, que uma página não forja.
 */
export function csrfProtection(webOrigin: string) {
  const allowed = new URL(webOrigin).origin;
  return (req: Request, res: Response, next: NextFunction) => {
    const underApi = req.path === '/api' || req.path.startsWith('/api/');
    if (!underApi || SAFE_METHODS.has(req.method)) return next();

    const origin = req.headers.origin;
    const sameOrigin =
      origin === undefined ? req.headers['sec-fetch-site'] === 'same-origin' : origin === allowed;
    if (sameOrigin) return next();
    sendProblem(res, 403, 'csrf_rejected');
  };
}
