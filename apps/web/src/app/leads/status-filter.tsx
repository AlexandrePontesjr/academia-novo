'use client';

import { LEAD_STATUSES, type LeadStatus } from '@academia/contracts';
import { Label, Select } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId } from 'react';
import { FilterActions, FilterToolbar } from '../../components/filter-toolbar.tsx';
import { LEAD_STATUS_LABELS } from '../../lib/leads.ts';

/**
 * A toolbar de "Interessados": o campo "Situação" e o par "Filtrar"/"Limpar". Escolher a situação já
 * carrega `/leads?status=...` (e "Em aberto" carrega `/leads`), como as outras listas.
 */
export function LeadStatusFilter({ value, count }: { value: LeadStatus | undefined; count?: number }) {
  const router = useRouter();
  const id = useId();
  const current = value ?? '';

  function go(status: string) {
    router.push(status ? `/leads?status=${status}` : '/leads');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(String(new FormData(event.currentTarget).get('status') ?? ''));
  }

  return (
    <FilterToolbar {...(count === undefined ? {} : { count })}>
      <form key={current} onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor={id}>Situação</Label>
            <Select id={id} name="status" defaultValue={current} onChange={(event) => go(event.target.value)}>
              <option value="">Em aberto</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <FilterActions onClear={() => router.push('/leads')} />
      </form>
    </FilterToolbar>
  );
}
