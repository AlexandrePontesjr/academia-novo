'use client';

import { INVALID_LINK_MESSAGE } from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import Link from 'next/link';
import { useState } from 'react';
import { callApi, UNAVAILABLE } from '../../../lib/api.ts';
import { SITE } from '../../site-content.ts';

type Outcome = { kind: 'idle' } | { kind: 'confirmed' } | { kind: 'invalid'; message: string } | { kind: 'failed' };

/** O botão "Confirmar e-mail": só o clique chama a API, nunca a abertura da página. */
export function ConfirmButton({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  async function confirm() {
    setPending(true);
    const result = await callApi('POST', '/api/leads/confirm', { token });
    setPending(false);
    if (result.kind === 'ok') setOutcome({ kind: 'confirmed' });
    else if (result.kind === 'validation') setOutcome({ kind: 'invalid', message: result.errors[0]?.message ?? INVALID_LINK_MESSAGE });
    else setOutcome({ kind: 'failed' });
  }

  if (outcome.kind === 'confirmed') {
    return (
      <p role="status" className="text-lg">
        {SITE.matricula.confirmed}
      </p>
    );
  }
  if (outcome.kind === 'invalid') {
    return (
      <div className="grid justify-items-start gap-4">
        <Alert variant="destructive">{outcome.message}</Alert>
        <Link href="/matricula" className="text-primary underline underline-offset-4">
          {SITE.matricula.back}
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {outcome.kind === 'failed' && <Alert variant="destructive">{UNAVAILABLE}</Alert>}
      <Button className="h-12 w-full" busy={pending} onClick={confirm}>
        {SITE.matricula.confirm}
      </Button>
    </div>
  );
}
