'use client';

import { Input, Label } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId } from 'react';
import { FilterActions, FilterToolbar } from '../../components/filter-toolbar.tsx';

/** As mensagens do `422` da API, pelo nome do parâmetro. */
export type PeriodErrors = Partial<Record<'from' | 'to', string>>;

function DayField({ name, label, value, error }: { name: string; label: string; value: string; error?: string }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        type="date"
        id={id}
        name={name}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-status-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A toolbar de "Presenças": "De" e "Até", o par "Filtrar"/"Limpar" e o total do período. Enviar leva
 * os dois dias para a query string de `/check-ins`; "Limpar" devolve a tela ao período padrão.
 */
export function PeriodFilter({
  from,
  to,
  errors,
  total,
}: {
  from: string;
  to: string;
  errors: PeriodErrors;
  total?: number;
}) {
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const name of ['from', 'to']) {
      const value = String(form.get(name) ?? '').trim();
      if (value) query.set(name, value);
    }
    router.push(query.size > 0 ? `/check-ins?${query}` : '/check-ins');
  }

  return (
    <FilterToolbar
      {...(total === undefined ? {} : { count: total, countLabel: `Total no período: ${total}` })}
    >
      {/* a chave refaz o formulário quando o período muda: os campos voltam ao que a página diz */}
      <form key={`${from}/${to}`} onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DayField name="from" label="De" value={from} error={errors.from} />
          <DayField name="to" label="Até" value={to} error={errors.to} />
        </div>
        <FilterActions onClear={() => router.push('/check-ins')} />
      </form>
    </FilterToolbar>
  );
}
