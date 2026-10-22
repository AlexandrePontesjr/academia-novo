'use client';

import type { CheckInsReport } from '@academia/contracts';
import { Alert, Button, Table, TableCell, TableHead, TableRow } from '@academia/ui';
import Link from 'next/link';
import { useState } from 'react';
import { callApi } from '../../lib/api.ts';
import { formatTime } from '../../lib/check-ins.ts';
import { formatBirthDate } from '../../lib/students.ts';

/** As presenças do período, na ordem da API; "Carregar mais" pede a página seguinte do mesmo período. */
export function ReportTable({ report }: { report: CheckInsReport }) {
  const [items, setItems] = useState(report.items);
  const [nextCursor, setNextCursor] = useState(report.nextCursor);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore(cursor: string) {
    setPending(true);
    const query = new URLSearchParams({ from: report.from, to: report.to, cursor });
    const result = await callApi<CheckInsReport>('GET', `/api/check-ins?${query}`);
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
    <div className="grid gap-4">
      <Table>
        <thead>
          <tr>
            <TableHead>Data</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Aluno</TableHead>
            <TableHead>Registrado por</TableHead>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{formatBirthDate(item.day)}</TableCell>
              <TableCell>{formatTime(item.checkedInAt)}</TableCell>
              <TableCell>
                <Link href={`/students/${item.student.id}`} prefetch={false} className="text-primary underline underline-offset-4">
                  {item.student.name}
                </Link>
              </TableCell>
              <TableCell>{item.checkedInBy.name}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
      {failed && <Alert variant="destructive">Não foi possível carregar as presenças.</Alert>}
      {nextCursor && (
        <div>
          <Button variant="outline" busy={pending} onClick={() => loadMore(nextCursor)}>
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
