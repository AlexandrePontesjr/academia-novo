'use client';

import type { OpenPaymentStatus } from '@academia/contracts';
import { Label, Select } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId } from 'react';
import { FilterActions, FilterToolbar } from '../../components/filter-toolbar.tsx';
import { PAYMENT_STATUS_LABELS } from '../../lib/payments.ts';

/**
 * A toolbar de "Pagamentos": o campo "Situação" e o par "Filtrar"/"Limpar". Escolher a situação já
 * carrega `/payments?status=...` (e "Todas" carrega `/payments`), como as outras listas; o "Filtrar"
 * envia o mesmo formulário.
 */
export function StatusFilter({ value, count }: { value: OpenPaymentStatus | undefined; count?: number }) {
  const router = useRouter();
  const id = useId();
  const current = value ?? '';

  function go(status: string) {
    router.push(status ? `/payments?status=${status}` : '/payments');
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
              <option value="">Todas</option>
              <option value="pending">{PAYMENT_STATUS_LABELS.pending}</option>
              <option value="overdue">{PAYMENT_STATUS_LABELS.overdue}</option>
            </Select>
          </div>
        </div>
        <FilterActions onClear={() => router.push('/payments')} />
      </form>
    </FilterToolbar>
  );
}
