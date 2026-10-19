'use client';

import { Button, Input, Label } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId } from 'react';

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
        <p id={`${id}-error`} className="text-sm text-[#f87171]">
          {error}
        </p>
      )}
    </div>
  );
}

/** "De" e "Até" acima da tabela: enviar leva os dois para a query string de `/check-ins`. */
export function PeriodFilter({ from, to, errors }: { from: string; to: string; errors: PeriodErrors }) {
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
    // a chave refaz o formulário quando o período muda: os campos voltam ao que a página diz
    <form key={`${from}/${to}`} onSubmit={submit} className="flex flex-wrap items-start gap-4">
      <DayField name="from" label="De" value={from} error={errors.from} />
      <DayField name="to" label="Até" value={to} error={errors.to} />
      <Button type="submit" className="mt-6">
        Filtrar
      </Button>
    </form>
  );
}
