'use client';

import type { CheckInsReport } from '@academia/contracts';
import { Alert, Button, ListOrTable } from '@academia/ui';
import Link from 'next/link';
import { useState } from 'react';
import { TEXT_LINK } from '../../components/link-class.ts';
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
      <ListOrTable
        head={['Data', 'Hora', 'Aluno', 'Registrado por']}
        rows={items.map((item) => ({
          key: item.id,
          cells: [
            formatBirthDate(item.day),
            formatTime(item.checkedInAt),
            <Link key="student" href={`/students/${item.student.id}`} prefetch={false} className={TEXT_LINK}>
              {item.student.name}
            </Link>,
            item.checkedInBy.name,
          ],
        }))}
      />
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
