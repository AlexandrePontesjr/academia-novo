'use client';

import { LEAD_STATUSES, type LeadStatus } from '@academia/contracts';
import { Label, Select } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { LEAD_STATUS_LABELS } from '../../lib/leads.ts';

/** O campo "Situação" acima da tabela: escolher carrega `/leads?status=...`, e "Em aberto" carrega `/leads`. */
export function LeadStatusFilter({ value }: { value: LeadStatus | undefined }) {
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
        onChange={(event) => router.push(event.target.value ? `/leads?status=${event.target.value}` : '/leads')}
      >
        <option value="">Em aberto</option>
        {LEAD_STATUSES.map((status) => (
          <option key={status} value={status}>
            {LEAD_STATUS_LABELS[status]}
          </option>
        ))}
      </Select>
    </div>
  );
}
