'use client';

import { Alert, Button } from '@academia/ui';
import { useRouter } from 'next/navigation';

export function StaffLoadError() {
  const router = useRouter();

  return (
    <div className="grid justify-items-start gap-4">
      <Alert variant="destructive">Não foi possível carregar os funcionários.</Alert>
      <Button variant="outline" onClick={() => router.refresh()}>
        Tentar novamente
      </Button>
    </div>
  );
}
