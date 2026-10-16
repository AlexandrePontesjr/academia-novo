'use client';

import type { StudentCheckInsResponse } from '@academia/contracts';
import { Alert, Button, Table, TableCell, TableHead, TableRow } from '@academia/ui';
import { useState } from 'react';
import { callApi } from '../../../lib/api.ts';
import { formatTime } from '../../../lib/check-ins.ts';
import { formatBirthDate } from '../../../lib/students.ts';

/**
 * O bloco "Presenças" da ficha: o histórico do aluno, na ordem da API, e "Carregar mais" acrescentando
 * a página seguinte abaixo. Só quem registra presença o recebe.
 */
export function CheckInsBlock({ studentId, initial }: { studentId: string; initial: StudentCheckInsResponse }) {
  const [items, setItems] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore(cursor: string) {
    setPending(true);
    const result = await callApi<StudentCheckInsResponse>(
      'GET',
      `/api/students/${studentId}/check-ins?${new URLSearchParams({ cursor })}`,
    );
    setPending(false);
    if (result.kind !== 'ok') {
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems((current) => [...current, ...result.data.items]);
    setNextCursor(result.data.nextCursor);
  }

  return (
    <section aria-labelledby="check-ins-heading" className="grid gap-4 border-t pt-4">
      <h3 id="check-ins-heading" className="text-lg font-semibold">
        Presenças
      </h3>
      {items.length === 0 ? (
        <p>Nenhuma presença registrada.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <TableHead>Data</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Registrado por</TableHead>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{formatBirthDate(item.day)}</TableCell>
                <TableCell>{formatTime(item.checkedInAt)}</TableCell>
                <TableCell>{item.checkedInBy.name}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
      {failed && <Alert variant="destructive">Não foi possível carregar as presenças.</Alert>}
      {nextCursor && (
        <div>
          <Button variant="outline" disabled={pending} onClick={() => loadMore(nextCursor)}>
            Carregar mais
          </Button>
        </div>
      )}
    </section>
  );
}
