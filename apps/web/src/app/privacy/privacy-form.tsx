'use client';

import type { PrivacySettings } from '@academia/contracts';
import { Alert, Button, Input, Label } from '@academia/ui';
import { type ReactNode, useId, useState } from 'react';
import { callApi, UNAVAILABLE } from '../../lib/api.ts';

const SAVED = 'Configurações salvas.';
const GENERIC_MESSAGE = 'Não foi possível salvar. Tente novamente.';
const EFFECT_YEARS_ON = 'Alunos inativos há mais tempo que isso são anonimizados automaticamente.';
const EFFECT_YEARS_OFF = 'A anonimização automática fica desligada e só acontece por pedido.';
const EFFECT_DAYS = 'As versões anteriores da foto são apagadas depois desse prazo.';

type Field = keyof PrivacySettings;

/** O que foi digitado vira número quando é número; o resto segue como texto, e a API diz o que está errado. */
const valueOf = (typed: string): number | string => (/^\s*-?\d+(\.\d+)?\s*$/.test(typed) ? Number(typed) : typed);

/**
 * O campo de prazo com a unidade dentro dele: a caixa do campo é a borda do controle, e o número e a
 * unidade ficam na mesma superfície (AC 56).
 */
function UnitField({
  id,
  unit,
  value,
  disabled,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  unit: string;
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={`flex h-11 w-44 items-center rounded-xl border bg-card pr-3 ${invalid ? 'border-status-bad' : 'border-border-control'} ${disabled ? 'opacity-50' : ''}`}
      data-slot="unit-field"
    >
      <Input
        id={id}
        inputMode="numeric"
        disabled={disabled}
        value={value}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className="h-full w-full border-0 bg-transparent px-4"
      />
      <span className="shrink-0 text-sm text-muted-foreground" data-slot="unit">
        {unit}
      </span>
    </div>
  );
}

/** O controle "Desligado" do tema: um interruptor, não o checkbox nativo do navegador (AC 56). */
function OffSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <label className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        data-slot="switch"
        onClick={() => onChange(!checked)}
        className={`inline-flex h-6 w-11 items-center rounded-full border border-border-control p-0.5 transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <span
          aria-hidden="true"
          data-slot="switch-thumb"
          className={`size-4 rounded-full transition-transform ${checked ? 'translate-x-5 bg-primary-foreground' : 'translate-x-0 bg-muted-foreground'}`}
        />
      </button>
      <span id={id} className="text-sm font-medium">
        Desligado
      </span>
    </label>
  );
}

function Effect({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground" data-slot="effect">
      {children}
    </p>
  );
}

/**
 * Os dois prazos de retenção (privacidade, door 4). "Desligado" é a anonimização automática sem prazo,
 * enviada como `null`; a validação é a da API, e cada mensagem aparece junto do campo dela.
 */
export function PrivacyForm({ initial }: { initial: PrivacySettings }) {
  const yearsId = useId();
  const daysId = useId();
  const [off, setOff] = useState(initial.inactiveStudentRetentionYears === null);
  const [years, setYears] = useState(String(initial.inactiveStudentRetentionYears ?? ''));
  const [days, setDays] = useState(String(initial.photoVersionRetentionDays));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<{ kind: 'saved' | 'failed'; text: string }>();
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage(undefined);
    const result = await callApi<PrivacySettings>('PUT', '/api/privacy-settings', {
      inactiveStudentRetentionYears: off ? null : valueOf(years),
      photoVersionRetentionDays: valueOf(days),
    });
    setPending(false);
    if (result.kind === 'ok') setMessage({ kind: 'saved', text: SAVED });
    else if (result.kind === 'validation') {
      setErrors(Object.fromEntries(result.errors.map(({ path, message: text }) => [path, text])));
    } else setMessage({ kind: 'failed', text: result.kind === 'unavailable' ? UNAVAILABLE : GENERIC_MESSAGE });
  }

  return (
    <form onSubmit={save} noValidate className="grid max-w-md gap-6">
      <fieldset className="grid gap-2">
        <Label htmlFor={yearsId}>Anonimizar alunos inativos há mais de</Label>
        <UnitField
          id={yearsId}
          unit="anos"
          value={off ? '' : years}
          disabled={off}
          invalid={errors.inactiveStudentRetentionYears !== undefined}
          describedBy={errors.inactiveStudentRetentionYears ? `${yearsId}-error` : undefined}
          onChange={setYears}
        />
        <OffSwitch checked={off} onChange={setOff} />
        <Effect>{off ? EFFECT_YEARS_OFF : EFFECT_YEARS_ON}</Effect>
        {errors.inactiveStudentRetentionYears && (
          <p id={`${yearsId}-error`} className="text-sm text-status-bad">
            {errors.inactiveStudentRetentionYears}
          </p>
        )}
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor={daysId}>Guardar versões de foto por</Label>
        <UnitField
          id={daysId}
          unit="dias"
          value={days}
          invalid={errors.photoVersionRetentionDays !== undefined}
          describedBy={errors.photoVersionRetentionDays ? `${daysId}-error` : undefined}
          onChange={setDays}
        />
        <Effect>{EFFECT_DAYS}</Effect>
        {errors.photoVersionRetentionDays && (
          <p id={`${daysId}-error`} className="text-sm text-status-bad">
            {errors.photoVersionRetentionDays}
          </p>
        )}
      </div>
      {message && (
        <Alert variant={message.kind === 'saved' ? 'default' : 'destructive'} {...(message.kind === 'saved' ? { 'data-motion': 'feedback' } : {})}>
          {message.text}
        </Alert>
      )}
      <Button type="submit" busy={pending} className="justify-self-start">
        Salvar
      </Button>
    </form>
  );
}
