'use client';

import { Alert, Button } from '@academia/ui';
import { useRouter } from 'next/navigation';

export function StudentsLoadError() {
  const router = useRouter();

  return (
    <div className="grid justify-items-start gap-4">
      <Alert variant="destructive">Não foi possível carregar os alunos.</Alert>
      <Button variant="outline" onClick={() => router.refresh()}>
        Tentar novamente
      </Button>
    </div>
  );
}
