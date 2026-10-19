'use client';

import { createPlanRequestSchema, PLAN_PERIODS, type Plan, updatePlanRequestSchema } from '@academia/contracts';
import { Alert, Button, Label, Select } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, UNAVAILABLE } from '../../lib/api.ts';
import { parsePrice, PERIOD_LABELS, priceInputOf } from '../../lib/plans.ts';

const INVALID_PRICE = 'Informe um valor em reais, como 99,90.';

interface FormValues {
  name: string;
  period: string;
  /** O valor como foi digitado, em reais; o que vai para a API são os centavos. */
  priceCents: string;
  rules: string;
}

function defaultsOf(plan?: Plan): FormValues {
  return {
    name: plan?.name ?? '',
    period: plan?.period ?? '',
    priceCents: plan ? priceInputOf(plan.priceCents) : '',
    rules: plan?.rules ?? '',
  };
}

/**
 * O corpo da requisição com o que foi digitado. No cadastro, os três obrigatórios e `rules` só se
 * preenchido. Na edição, só o que mudou em relação ao plano aberto, `rules` apagado como `null`, que o
 * limpa, e nunca `period`, que a API não aceita.
 */
function bodyOf(values: FormValues, priceCents: number | undefined, plan: Plan | undefined): Record<string, unknown> {
  const name = values.name.trim();
  const rules = values.rules.trim();
  if (!plan) return { name, period: values.period, priceCents, ...(rules !== '' && { rules }) };
  return {
    ...(name !== plan.name && { name }),
    ...(priceCents !== plan.priceCents && { priceCents }),
    ...(rules !== (plan.rules ?? '') && { rules: rules === '' ? null : rules }),
  };
}

/** Formulário de cadastro (`/plans/new`) e de edição (`/plans/<id>/edit`) de plano. */
export function PlanForm({ plan }: { plan?: Plan }) {
  const router = useRouter();
  const periodId = useId();
  const rulesId = useId();
  const [alert, setAlert] = useState<string>();
  const form = useForm<FormValues>({ defaultValues: defaultsOf(plan) });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: FormValues) {
    setAlert(undefined);
    const priceCents = parsePrice(values.priceCents);
    const body = bodyOf(values, priceCents, plan);
    // a mesma conferência que a API faz, antes de enviar; o valor que não é em reais tem a mensagem da tela
    const checked = (plan ? updatePlanRequestSchema : createPlanRequestSchema).safeParse(body);
    const byPath = new Map<string, string>();
    if (priceCents === undefined) byPath.set('priceCents', INVALID_PRICE);
    for (const issue of checked.error?.issues ?? []) {
      if (!byPath.has(issue.path.join('.'))) byPath.set(issue.path.join('.'), issue.message);
    }
    if (byPath.size > 0) {
      showFieldErrors(form, [...byPath].map(([path, message]) => ({ path, message })));
      return;
    }

    const result = plan
      ? await callApi<Plan>('PATCH', `/api/plans/${plan.id}`, body)
      : await callApi<Plan>('POST', '/api/plans', body);

    if (result.kind === 'ok') router.push('/plans');
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível concluir. Tente novamente.');
  }

  return (
    <form noValidate className="grid max-w-xl gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField label="Nome" autoComplete="off" error={errors.name?.message} registration={form.register('name')} />
      <div className="grid gap-1.5">
        <Label htmlFor={periodId}>Periodicidade</Label>
        {/* a periodicidade não muda depois do cadastro: mudar é criar outro plano (door 1) */}
        <Select
          id={periodId}
          disabled={plan !== undefined}
          aria-invalid={errors.period ? true : undefined}
          aria-describedby={errors.period ? `${periodId}-error` : undefined}
          {...form.register('period')}
        >
          <option value=""></option>
          {PLAN_PERIODS.map((period) => (
            <option key={period} value={period}>
              {PERIOD_LABELS[period]}
            </option>
          ))}
        </Select>
        {errors.period && (
          <p id={`${periodId}-error`} className="text-sm text-[#f87171]">
            {errors.period.message}
          </p>
        )}
      </div>
      <TextField
        label="Valor (R$)"
        inputMode="decimal"
        autoComplete="off"
        error={errors.priceCents?.message}
        registration={form.register('priceCents')}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={rulesId}>Regras de acesso</Label>
        <textarea
          id={rulesId}
          rows={4}
          aria-invalid={errors.rules ? true : undefined}
          aria-describedby={errors.rules ? `${rulesId}-error` : undefined}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground aria-invalid:border-[#f87171]"
          {...form.register('rules')}
        />
        {errors.rules && (
          <p id={`${rulesId}-error`} className="text-sm text-[#f87171]">
            {errors.rules.message}
          </p>
        )}
      </div>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
