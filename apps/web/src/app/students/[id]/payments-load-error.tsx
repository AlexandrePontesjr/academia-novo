'use client';

import { Alert, Button } from '@academia/ui';
import { useRouter } from 'next/navigation';

/** O bloco de pagamentos não carregou: o resto da ficha segue na página. */
export function PaymentsLoadError() {
  const router = useRouter();

  return (
    <section aria-labelledby="payments-error-heading" className="grid justify-items-start gap-4 rounded-3xl border bg-card p-5">
      <h3 id="payments-error-heading" className="text-lg font-semibold">
        Pagamentos
      </h3>
      <Alert variant="destructive">Não foi possível carregar os pagamentos.</Alert>
      <Button variant="outline" onClick={() => router.refresh()}>
        Tentar novamente
      </Button>
    </section>
  );
}
