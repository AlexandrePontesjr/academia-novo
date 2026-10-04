import type { Consent, ConsentPurpose, GuardianRelationship } from '@academia/contracts';

/** A finalidade por extenso, como aparece nas telas. */
export const PURPOSE_LABELS: Record<ConsentPurpose, string> = {
  data_processing: 'Uso de dados pessoais',
  image_use: 'Uso da imagem',
};

/** A ordem das finalidades na ficha. */
export const PURPOSES: ConsentPurpose[] = ['data_processing', 'image_use'];

export const RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  mother: 'Mãe',
  father: 'Pai',
  legal_guardian: 'Responsável legal',
  other: 'Outro',
};

const dayFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `dd/MM/aaaa` de um instante, no fuso da tela. */
export const formatDay = (iso: string) => dayFormat.format(new Date(iso));

/** Quem concedeu, como a trilha o mostra. */
export const GRANTOR_LABELS = { student: 'Aluno', guardian: 'Responsável' } as const;

export const PENDING_GUARDIAN = 'Responsável pendente: edite o aluno para cadastrar o responsável legal.';

export type PurposeState =
  | { kind: 'active'; consent: Consent }
  | { kind: 'revoked'; revokedAt: string }
  | { kind: 'pending' };

/** O estado de uma finalidade: o ativo vale mais que os revogados, e entre os revogados vale o mais recente. */
export function stateOf(items: Consent[], purpose: ConsentPurpose): PurposeState {
  const ofPurpose = items.filter((item) => item.purpose === purpose);
  const active = ofPurpose.find((item) => item.revokedAt === null);
  if (active) return { kind: 'active', consent: active };
  const revoked = ofPurpose.flatMap((item) => (item.revokedAt === null ? [] : [item.revokedAt])).sort();
  const latest = revoked[revoked.length - 1];
  return latest ? { kind: 'revoked', revokedAt: latest } : { kind: 'pending' };
}

export function stateText(state: PurposeState): string {
  if (state.kind === 'active') {
    return `Consentido, versão ${state.consent.termVersion}, em ${formatDay(state.consent.grantedAt)}`;
  }
  return state.kind === 'revoked' ? `Revogado em ${formatDay(state.revokedAt)}` : 'Pendente';
}
