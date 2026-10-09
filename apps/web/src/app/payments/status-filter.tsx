'use client';

import type { OpenPaymentStatus } from '@academia/contracts';
import { Label, Select } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { PAYMENT_STATUS_LABELS } from '../../lib/payments.ts';

/** O campo "Situação" acima da tabela: escolher carrega `/payments?status=...`, e "Todas" carrega `/payments`. */
export function StatusFilter({ value }: { value: OpenPaymentStatus | undefined }) {
  const router = useRouter();
  const id = useId();

  return (
    <div className="grid max-w-xs gap-1.5">
      <Label htmlFor={id}>Situação</Label>
      {/* a chave refaz o campo quando a URL muda: ele volta ao que ela diz */}
      <Select
        key={value ?? ''}
        id={id}
        defaultValue={value ?? ''}
        onChange={(event) => router.push(event.target.value ? `/payments?status=${event.target.value}` : '/payments')}
      >
        <option value="">Todas</option>
        <option value="pending">{PAYMENT_STATUS_LABELS.pending}</option>
        <option value="overdue">{PAYMENT_STATUS_LABELS.overdue}</option>
      </Select>
    </div>
  );
}
