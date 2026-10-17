import { problemSchema, type Role } from '@academia/contracts';

/** Só o Administrador exporta, anonimiza e configura a retenção (privacidade). */
export const canUsePrivacy = (role: Role) => role === 'admin';

/** O titular de uma ficha: o caminho da API e o da tela. */
export type Subject = 'student' | 'staff';
export const SUBJECT_BASE: Record<Subject, string> = { student: 'students', staff: 'staff' };

export const ANONYMIZE_WARNING =
  'Os dados pessoais, as fotos, os responsáveis e os consentimentos serão apagados. Matrículas, pagamentos e presenças ficam sem identificação. Isto não pode ser desfeito.';
export const ANONYMIZED_NOTICE = 'Titular anonimizado.';
export const EXPORT_FAILED = 'Não foi possível exportar os dados.';

/** O que o diálogo diz de cada recusa da anonimização, por `code`; qualquer outra resposta é a genérica. */
const ANONYMIZE_MESSAGES: Record<string, string> = {
  subject_not_inactive: 'Inative o cadastro antes de anonimizar.',
  subject_has_open_periods: 'Cancele ou confirme os períodos em aberto antes de anonimizar.',
  staff_user_linked: 'Desvincule o usuário antes de anonimizar.',
  storage_unavailable: 'Armazenamento de fotos indisponível. Tente de novo.',
};
const ANONYMIZE_FAILED = 'Não foi possível anonimizar.';

/** A API não respondeu neste prazo: para a tela, é o mesmo que estar fora. */
const TIMEOUT_MS = 10_000;

/**
 * Pede a anonimização. `undefined` no `204`; senão, a mensagem do diálogo. Lê o `code` também do
 * `503`, que o `callApi` comum trata como indisponível sem distinguir o armazenamento.
 */
export async function anonymize(subject: Subject, id: string): Promise<string | undefined> {
  try {
    const response = await fetch(`/api/${SUBJECT_BASE[subject]}/${id}/anonymization`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 204) return undefined;
    if (response.status !== 409 && response.status !== 503) return ANONYMIZE_FAILED;
    const problem = problemSchema.safeParse(await response.json());
    return (problem.success && ANONYMIZE_MESSAGES[problem.data.code]) || ANONYMIZE_FAILED;
  } catch {
    return ANONYMIZE_FAILED;
  }
}

/** O nome que a API dá ao anexo, lido de `Content-Disposition`. */
export function attachmentName(disposition: string | null, fallback: string): string {
  return /filename="([^"]+)"/.exec(disposition ?? '')?.[1] ?? fallback;
}
