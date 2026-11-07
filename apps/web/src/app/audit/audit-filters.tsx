'use client';

import { AUDIT_ACTIONS } from '@academia/contracts';
import { Input, Label, Select } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useId } from 'react';
import { FilterActions, FilterToolbar } from '../../components/filter-toolbar.tsx';
import { ACTION_LABELS, AUDIT_FILTERS, type AuditFilterValues } from '../../lib/audit.ts';

interface AuditFiltersProps {
  values: AuditFilterValues;
  users: Array<{ id: string; name: string }>;
  /** As mensagens do `422` da API, pelo nome do filtro. */
  errors: Partial<Record<keyof AuditFilterValues, string>>;
  /** quantos registros a página devolveu; sem a resposta, a contagem não aparece. */
  count?: number;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-error` : undefined,
      })}
      {error && (
        <p id={`${id}-error`} className="text-sm text-status-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A toolbar da trilha: os filtros acima da tabela e o par "Filtrar"/"Limpar". Filtrar leva os
 * preenchidos para a query string; limpar, nenhum.
 */
export function AuditFilters({ values, users, errors, count }: AuditFiltersProps) {
  const router = useRouter();

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const name of AUDIT_FILTERS) {
      const value = String(form.get(name) ?? '').trim();
      if (value) query.set(name, value);
    }
    router.push(query.size > 0 ? `/audit?${query}` : '/audit');
  }

  return (
    <FilterToolbar {...(count === undefined ? {} : { count })}>
      {/* a chave refaz o formulário quando os filtros da URL mudam: os campos voltam ao que ela diz */}
      <form key={JSON.stringify(values)} onSubmit={filter} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="De" error={errors.from}>
            {(props) => <Input type="date" name="from" defaultValue={values.from} {...props} />}
          </Field>
          <Field label="Até" error={errors.to}>
            {(props) => <Input type="date" name="to" defaultValue={values.to} {...props} />}
          </Field>
          <Field label="Usuário" error={errors.userId}>
            {(props) => (
              <Select name="userId" defaultValue={values.userId} {...props}>
                <option value="">Todos</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Ação" error={errors.action}>
            {(props) => (
              <Select name="action" defaultValue={values.action} {...props}>
                <option value="">Todas</option>
                {AUDIT_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {ACTION_LABELS[action]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="IP" error={errors.ip}>
            {(props) => <Input type="text" name="ip" defaultValue={values.ip} {...props} />}
          </Field>
        </div>
        <FilterActions onClear={() => router.push('/audit')} />
      </form>
    </FilterToolbar>
  );
}
