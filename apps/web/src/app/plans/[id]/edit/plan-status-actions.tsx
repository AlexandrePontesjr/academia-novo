'use client';

import type { PlanStatus } from '@academia/contracts';
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
import { type ApiResult, callApi, UNAVAILABLE } from '../../../../lib/api.ts';

/** Os botões de situação da edição: inativar pede confirmação e volta à lista; reativar não confirma. */
export function PlanStatusActions({ id, name, status }: { id: string; name: string; status: PlanStatus }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<string>();

  async function send(request: () => Promise<ApiResult<unknown>>, done: () => void) {
    setPending(true);
    setAlert(undefined);
    const result = await request();
    setPending(false);
    if (result.kind === 'ok') done();
    else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível concluir. Tente novamente.');
  }

  function close() {
    setAsking(false);
    setAlert(undefined);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {alert && !asking && <Alert variant="destructive">{alert}</Alert>}
      {status === 'inactive' ? (
        <Button
          variant="outline"
          busy={pending}
          onClick={() => send(() => callApi('PATCH', `/api/plans/${id}`, { status: 'active' }), () => router.refresh())}
        >
          Reativar
        </Button>
      ) : (
        <Button variant="destructive" onClick={() => setAsking(true)}>
          Inativar
        </Button>
      )}

      <Dialog open={asking} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogTitle>Inativar plano</DialogTitle>
          <DialogDescription>
            {name} deixará de aceitar matrículas novas. As matrículas que já existem seguem até o vencimento.
          </DialogDescription>
          {alert && <Alert variant="destructive">{alert}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              busy={pending}
              onClick={() => send(() => callApi('DELETE', `/api/plans/${id}`), () => router.push('/plans'))}
            >
              Inativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
