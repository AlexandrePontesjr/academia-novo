import { type Problem, problemSchema } from '@academia/contracts';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

export const UNAVAILABLE = 'Serviço indisponível. Tente novamente em instantes.';

/** A API não respondeu neste prazo: para a tela, é o mesmo que estar fora. */
const TIMEOUT_MS = 3000;

export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'validation'; errors: NonNullable<Problem['errors']> }
  | { kind: 'problem'; status: number; code: string; retryAfter?: number }
  | { kind: 'unavailable' };

/** Chama a API pela origem do web. Nunca lança: toda falha vira um resultado que a tela trata. */
export async function callApi<T = undefined>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 500) return { kind: 'unavailable' };
    if (response.ok) {
      const data = response.status === 204 ? undefined : await response.json();
      return { kind: 'ok', data: data as T };
    }

    const problem = problemSchema.safeParse(await response.json());
    if (!problem.success) return { kind: 'unavailable' };
    if (response.status === 422 && problem.data.errors) {
      return { kind: 'validation', errors: problem.data.errors };
    }
    const retryAfter = Number(response.headers.get('Retry-After'));
    return {
      kind: 'problem',
      status: response.status,
      code: problem.data.code,
      ...(retryAfter > 0 && { retryAfter }),
    };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** Põe cada `message` de um `422` junto do campo indicado em `path`. */
export function showFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  errors: NonNullable<Problem['errors']>,
) {
  for (const { path, message } of errors) form.setError(path as Path<T>, { message });
}

export function tooManyAttempts(retryAfter = 60) {
  return `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minutos.`;
}
