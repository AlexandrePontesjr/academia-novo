'use client';

import type { StudentStatus } from '@academia/contracts';
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
import { useState } from 'react';
import { type ApiResult, callApi, UNAVAILABLE } from '../../../lib/api.ts';

type Change = 'suspend' | 'inactivate';

const COPY: Record<Change, { title: string; verb: string; effect: string }> = {
  suspend: { title: 'Suspender aluno', verb: 'Suspender', effect: 'ficará com a situação Suspenso' },
  inactivate: {
    title: 'Inativar aluno',
    verb: 'Inativar',
    effect: 'ficará com a situação Inativo, e a ficha continua guardada',
  },
};

/** Os botões de situação da ficha: suspender e inativar pedem confirmação; reativar não. */
export function StatusActions({ id, name, status }: { id: string; name: string; status: StudentStatus }) {
  const router = useRouter();
  const [asking, setAsking] = useState<Change>();
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<string>();

  async function send(request: () => Promise<ApiResult<unknown>>) {
    setPending(true);
    setAlert(undefined);
    const result = await request();
    setPending(false);
    if (result.kind === 'ok') {
      setAsking(undefined);
      router.refresh();
    } else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível concluir. Tente novamente.');
  }

  const confirm = () =>
    send(() =>
      asking === 'inactivate'
        ? callApi('DELETE', `/api/students/${id}`)
        : callApi('PATCH', `/api/students/${id}`, { status: 'suspended' }),
    );

  function close() {
    setAsking(undefined);
    setAlert(undefined);
  }

  return (
    <>
      {status === 'active' && (
        <Button variant="outline" onClick={() => setAsking('suspend')}>
          Suspender
        </Button>
      )}
      {status !== 'active' && (
        <Button
          variant="outline"
          busy={pending}
          onClick={() => send(() => callApi('PATCH', `/api/students/${id}`, { status: 'active' }))}
        >
          Reativar
        </Button>
      )}
      {status !== 'inactive' && (
        <Button variant="destructive" onClick={() => setAsking('inactivate')}>
          Inativar
        </Button>
      )}
      {alert && !asking && <Alert variant="destructive">{alert}</Alert>}

      <Dialog open={asking !== undefined} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          {asking && (
            <>
              <DialogTitle>{COPY[asking].title}</DialogTitle>
              <DialogDescription>
                {name} {COPY[asking].effect}.
              </DialogDescription>
              {alert && <Alert variant="destructive">{alert}</Alert>}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button variant="destructive" busy={pending} onClick={confirm}>
                  {COPY[asking].verb}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
