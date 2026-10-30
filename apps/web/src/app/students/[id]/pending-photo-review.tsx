'use client';

import type { PendingPhoto } from '@academia/contracts';
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
import { callApi, UNAVAILABLE } from '../../../lib/api.ts';

/** A foto que o aluno enviou pelo portal, ao lado da corrente: `admin` e `reception` aprovam ou recusam (AC 51). */
export function PendingPhotoReview({ studentId, name, pending }: { studentId: string; name: string; pending: PendingPhoto }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'reject'>();
  const [alert, setAlert] = useState<string>();

  async function decide(action: 'approve' | 'reject') {
    setBusy(action);
    setAlert(undefined);
    const result = await callApi('POST', `/api/students/${studentId}/photo/pending/${action}`);
    setBusy(undefined);
    // `404`: outra pessoa da recepção decidiu antes, e a ficha relida mostra o resultado
    if (result.kind === 'ok' || (result.kind === 'problem' && result.status === 404)) {
      setAsking(false);
      router.refresh();
    } else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível concluir. Tente novamente.');
  }

  return (
    <div className="grid content-start justify-items-start gap-3">
      {pending.url && <img src={pending.url} alt={`Foto enviada por ${name}`} className="h-40 w-30 rounded-md object-cover" />}
      <p className="text-sm text-muted-foreground">Foto enviada pelo aluno, aguardando aprovação.</p>
      <div className="flex flex-wrap gap-2">
        <Button busy={busy === 'approve'} onClick={() => decide('approve')}>
          Aprovar
        </Button>
        <Button variant="outline" onClick={() => (setAlert(undefined), setAsking(true))}>
          Recusar
        </Button>
      </div>
      {alert && !asking && <Alert variant="destructive">{alert}</Alert>}

      <Dialog open={asking} onOpenChange={(open) => !open && !busy && setAsking(false)}>
        <DialogContent>
          <DialogTitle>Recusar foto</DialogTitle>
          <DialogDescription>A foto enviada por {name} será apagada, e a foto atual continua na ficha.</DialogDescription>
          {alert && <Alert variant="destructive">{alert}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Voltar</Button>
            </DialogClose>
            <Button variant="destructive" busy={busy === 'reject'} onClick={() => decide('reject')}>
              Recusar foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
