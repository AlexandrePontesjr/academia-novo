'use client';

import type { Consent, ConsentPurpose, ConsentTerm, Guardian, StudentConsentsResponse } from '@academia/contracts';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { callApi, UNAVAILABLE } from '../../../lib/api.ts';
import {
  PENDING_GUARDIAN,
  PURPOSE_LABELS,
  PURPOSES,
  RELATIONSHIP_LABELS,
  stateOf,
  stateText,
} from '../../../lib/consents.ts';
import { formatCpf, formatPhone } from '../../../lib/students.ts';

const ACTIVE_MESSAGE = 'Este consentimento já foi registrado.';
const OUTDATED_MESSAGE = 'O termo foi atualizado. Leia a nova versão e confirme de novo.';
const GENERIC_MESSAGE = 'Não foi possível concluir. Tente novamente.';

type TermState = { status: 'loading' } | { status: 'ready'; term: ConsentTerm } | { status: 'failed' };

/** O bloco "Responsável e consentimentos" da ficha: o responsável atual, o estado de cada finalidade e as duas ações. */
export function ConsentsBlock({
  studentId,
  studentName,
  minor,
  data,
}: {
  studentId: string;
  studentName: string;
  minor: boolean;
  data: StudentConsentsResponse;
}) {
  const [granting, setGranting] = useState<ConsentPurpose>();
  const [revoking, setRevoking] = useState<Consent>();
  const { guardian, items } = data;

  return (
    <section aria-labelledby="consents-heading" className="grid gap-4 border-t pt-4">
      <h3 id="consents-heading" className="text-lg font-semibold">
        Responsável e consentimentos
      </h3>
      {guardian ? (
        <GuardianSummary guardian={guardian} />
      ) : (
        <div className="grid gap-1">
          <p>Nenhum responsável cadastrado.</p>
          {minor && <p className="text-sm text-destructive">{PENDING_GUARDIAN}</p>}
        </div>
      )}
      <div className="grid gap-3">
        {PURPOSES.map((purpose) => {
          const state = stateOf(items, purpose);
          return (
            <section
              key={purpose}
              aria-label={PURPOSE_LABELS[purpose]}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <h4 className="font-medium">{PURPOSE_LABELS[purpose]}</h4>
                <p className="text-sm text-muted-foreground">{stateText(state)}</p>
              </div>
              {state.kind === 'active' ? (
                <Button variant="outline" onClick={() => setRevoking(state.consent)}>
                  Revogar
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setGranting(purpose)}>
                  Registrar consentimento
                </Button>
              )}
            </section>
          );
        })}
      </div>
      {granting && (
        <GrantDialog
          studentId={studentId}
          purpose={granting}
          minor={minor}
          guardian={guardian}
          onClose={() => setGranting(undefined)}
        />
      )}
      {revoking && (
        <RevokeDialog
          studentId={studentId}
          studentName={studentName}
          consent={revoking}
          onClose={() => setRevoking(undefined)}
        />
      )}
    </section>
  );
}

function GuardianSummary({ guardian }: { guardian: Guardian }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <div>
        <dt className="text-sm text-muted-foreground">Responsável</dt>
        <dd>{guardian.name}</dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">CPF do responsável</dt>
        <dd>{formatCpf(guardian.cpf)}</dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">Telefone do responsável</dt>
        <dd>{formatPhone(guardian.phone)}</dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">Parentesco</dt>
        <dd>{RELATIONSHIP_LABELS[guardian.relationship]}</dd>
      </div>
    </dl>
  );
}

/** O diálogo de registro: o texto vigente inteiro, quem concede e a confirmação; nada é enviado antes dela. */
function GrantDialog({
  studentId,
  purpose,
  minor,
  guardian,
  onClose,
}: {
  studentId: string;
  purpose: ConsentPurpose;
  minor: boolean;
  guardian: Guardian | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [term, setTerm] = useState<TermState>({ status: 'loading' });
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const choices: Array<{ value: 'student' | 'guardian'; label: string }> = [
    ...(minor ? [] : [{ value: 'student' as const, label: 'O próprio aluno' }]),
    ...(guardian ? [{ value: 'guardian' as const, label: `O responsável: ${guardian.name}` }] : []),
  ];
  const [grantedBy, setGrantedBy] = useState<'student' | 'guardian' | undefined>(choices[0]?.value);

  const loadTerm = useCallback(async () => {
    const result = await callApi<{ items: ConsentTerm[] }>('GET', '/api/consent-terms');
    const found = result.kind === 'ok' ? result.data.items.find((item) => item.purpose === purpose) : undefined;
    setTerm(found ? { status: 'ready', term: found } : { status: 'failed' });
  }, [purpose]);

  useEffect(() => {
    void loadTerm();
  }, [loadTerm]);

  async function confirm() {
    if (term.status !== 'ready' || !grantedBy) return;
    setPending(true);
    setMessage(undefined);
    const result = await callApi('POST', `/api/students/${studentId}/consents`, {
      purpose,
      termVersion: term.term.version,
      grantedBy,
    });
    setPending(false);
    if (result.kind === 'ok') {
      onClose();
      router.refresh();
    } else if (result.kind === 'problem' && result.code === 'consent_active') {
      setMessage(ACTIVE_MESSAGE);
      await loadTerm();
      router.refresh();
    } else if (result.kind === 'problem' && result.code === 'consent_term_outdated') {
      setMessage(OUTDATED_MESSAGE);
      await loadTerm();
    } else if (result.kind === 'validation') {
      setMessage(result.errors[0]?.message ?? GENERIC_MESSAGE);
    } else setMessage(result.kind === 'unavailable' ? UNAVAILABLE : GENERIC_MESSAGE);
  }

  const blocked = minor && !guardian;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Registrar consentimento</DialogTitle>
        <DialogDescription>{PURPOSE_LABELS[purpose]}</DialogDescription>
        {term.status === 'loading' && <p>Carregando o termo...</p>}
        {term.status === 'failed' && <Alert variant="destructive">Não foi possível carregar o termo.</Alert>}
        {term.status === 'ready' && (
          <p className="max-h-60 overflow-auto text-sm break-words whitespace-pre-wrap">{term.term.text}</p>
        )}
        {blocked ? (
          <p className="text-sm text-destructive">{PENDING_GUARDIAN}</p>
        ) : (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Quem concede</legend>
            {choices.map((choice) => (
              <label key={choice.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="granted-by"
                  value={choice.value}
                  checked={grantedBy === choice.value}
                  onChange={() => setGrantedBy(choice.value)}
                />
                {choice.label}
              </label>
            ))}
          </fieldset>
        )}
        {message && <Alert variant="destructive">{message}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button disabled={pending || blocked || term.status !== 'ready'} onClick={confirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A confirmação de revogar: nomeia a finalidade e o aluno antes de enviar. */
function RevokeDialog({
  studentId,
  studentName,
  consent,
  onClose,
}: {
  studentId: string;
  studentName: string;
  consent: Consent;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function confirm() {
    setPending(true);
    setMessage(undefined);
    const result = await callApi('DELETE', `/api/students/${studentId}/consents/${consent.id}`);
    setPending(false);
    if (result.kind === 'ok') {
      onClose();
      router.refresh();
    } else setMessage(result.kind === 'unavailable' ? UNAVAILABLE : GENERIC_MESSAGE);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Revogar consentimento</DialogTitle>
        <DialogDescription>
          Revogar &ldquo;{PURPOSE_LABELS[consent.purpose]}&rdquo; de {studentName}? O registro continua guardado.
        </DialogDescription>
        {message && <Alert variant="destructive">{message}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
