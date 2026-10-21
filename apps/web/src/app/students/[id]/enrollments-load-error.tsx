'use client';

import { Alert, Button } from '@academia/ui';
import { useRouter } from 'next/navigation';

/** O bloco de matrículas não carregou: o resto da ficha segue na página. */
export function EnrollmentsLoadError() {
  const router = useRouter();

  return (
    <section aria-labelledby="enrollments-error-heading" className="grid justify-items-start gap-4 rounded-2xl border bg-card p-5">
      <h3 id="enrollments-error-heading" className="text-lg font-semibold">
        Matrículas
      </h3>
      <Alert variant="destructive">Não foi possível carregar as matrículas.</Alert>
      <Button variant="outline" onClick={() => router.refresh()}>
        Tentar novamente
      </Button>
    </section>
  );
}
