'use client';

import { Alert, Button } from '@academia/ui';
import { useRouter } from 'next/navigation';

/** O bloco de presenças não carregou: o resto da ficha segue na página. */
export function CheckInsLoadError() {
  const router = useRouter();

  return (
    <section aria-labelledby="check-ins-error-heading" className="grid justify-items-start gap-4 border-t pt-4">
      <h3 id="check-ins-error-heading" className="text-lg font-semibold">
        Presenças
      </h3>
      <Alert variant="destructive">Não foi possível carregar as presenças.</Alert>
      <Button variant="outline" onClick={() => router.refresh()}>
        Tentar novamente
      </Button>
    </section>
  );
}
