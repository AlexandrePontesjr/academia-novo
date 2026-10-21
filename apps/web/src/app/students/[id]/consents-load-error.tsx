'use client';

import { Alert, Button } from '@academia/ui';
import { useRouter } from 'next/navigation';

/** O bloco de consentimentos não carregou: o resto da ficha segue na página. */
export function ConsentsLoadError() {
  const router = useRouter();

  return (
    <section aria-labelledby="consents-error-heading" className="grid justify-items-start gap-4 rounded-2xl border bg-card p-5">
      <h3 id="consents-error-heading" className="text-lg font-semibold">
        Responsável e consentimentos
      </h3>
      <Alert variant="destructive">Não foi possível carregar os consentimentos.</Alert>
      <Button variant="outline" onClick={() => router.refresh()}>
        Tentar novamente
      </Button>
    </section>
  );
}
