'use client';

import type { StaffStatus } from '@academia/contracts';
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

/** Os botões de situação da ficha: inativar pede confirmação; reativar não. */
export function StaffStatusActions({ id, name, status }: { id: string; name: string; status: StaffStatus }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<string>();

  async function send(request: () => Promise<ApiResult<unknown>>) {
    setPending(true);
    setAlert(undefined);
    const result = await request();
    setPending(false);
    if (result.kind === 'ok') {
      setAsking(false);
      router.refresh();
    } else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível concluir. Tente novamente.');
  }

  function close() {
    setAsking(false);
    setAlert(undefined);
  }

  return (
    <>
      {status === 'inactive' ? (
        <Button
          variant="outline"
          busy={pending}
          onClick={() => send(() => callApi('PATCH', `/api/staff/${id}`, { status: 'active' }))}
        >
          Reativar
        </Button>
      ) : (
        <Button variant="destructive" onClick={() => setAsking(true)}>
          Inativar
        </Button>
      )}
      {alert && !asking && <Alert variant="destructive">{alert}</Alert>}

      <Dialog open={asking} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogTitle>Inativar funcionário</DialogTitle>
          <DialogDescription>
            {name} ficará com a situação Inativo, e a ficha, o vínculo com o usuário e a foto continuam guardados.
          </DialogDescription>
          {alert && <Alert variant="destructive">{alert}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              busy={pending}
              onClick={() => send(() => callApi('DELETE', `/api/staff/${id}`))}
            >
              Inativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
