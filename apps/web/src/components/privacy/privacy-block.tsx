'use client';

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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ANONYMIZE_WARNING,
  anonymize,
  attachmentName,
  EXPORT_FAILED,
  type Subject,
  SUBJECT_BASE,
} from '../../lib/privacy.ts';

/**
 * O bloco "Privacidade" da ficha de aluno ou de funcionário: exportar, a versão para impressão e
 * anonimizar. Só o Administrador o recebe, e ele não pede nada à API ao abrir: só ao clicar.
 */
export function PrivacyBlock({ subject, id, name }: { subject: Subject; id: string; name: string }) {
  const base = SUBJECT_BASE[subject];
  const [exportFailed, setExportFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function download() {
    setExporting(true);
    setExportFailed(false);
    try {
      const response = await fetch(`/api/${base}/${id}/data-export`, { signal: AbortSignal.timeout(10_000) });
      if (response.status !== 200) throw new Error('exportação recusada');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = attachmentName(response.headers.get('Content-Disposition'), `${id}.json`);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-labelledby="privacy-heading" className="grid gap-4 border-t pt-4">
      <h3 id="privacy-heading" className="text-lg font-semibold">
        Privacidade
      </h3>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={exporting} onClick={download}>
          Exportar dados
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/${base}/${id}/print`} prefetch={false}>
            Versão para impressão
          </Link>
        </Button>
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Anonimizar
        </Button>
      </div>
      {exportFailed && (
        <div className="grid justify-items-start gap-4">
          <Alert variant="destructive">{EXPORT_FAILED}</Alert>
          <Button variant="outline" disabled={exporting} onClick={download}>
            Tentar novamente
          </Button>
        </div>
      )}
      {confirming && <AnonymizeDialog subject={subject} id={id} name={name} onClose={() => setConfirming(false)} />}
    </section>
  );
}

/** A confirmação da anonimização: diz o que some e o que fica, e fica aberta com a recusa da API. */
function AnonymizeDialog({ subject, id, name, onClose }: { subject: Subject; id: string; name: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function confirm() {
    setPending(true);
    setMessage(undefined);
    const refused = await anonymize(subject, id);
    if (refused === undefined) {
      router.push(`/${SUBJECT_BASE[subject]}?anonymized=1`);
      return;
    }
    setPending(false);
    setMessage(refused);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogTitle>Anonimizar {name}</DialogTitle>
        <DialogDescription>{ANONYMIZE_WARNING}</DialogDescription>
        {message && <Alert variant="destructive">{message}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            Anonimizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
