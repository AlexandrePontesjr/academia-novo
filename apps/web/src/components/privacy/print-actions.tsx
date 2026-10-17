'use client';

import { Alert, Button } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { EXPORT_FAILED } from '../../lib/privacy.ts';

/** O botão que abre a impressão do navegador, de onde sai o PDF (door 5). */
export function PrintButton() {
  return (
    <Button className="print:hidden" onClick={() => window.print()}>
      Imprimir
    </Button>
  );
}

/** A exportação falhou: a mensagem e o botão que pede de novo. */
export function ExportLoadError() {
  const router = useRouter();

  return (
    <div className="grid justify-items-start gap-4">
      <Alert variant="destructive">{EXPORT_FAILED}</Alert>
      <Button variant="outline" onClick={() => router.refresh()}>
        Tentar novamente
      </Button>
    </div>
  );
}
