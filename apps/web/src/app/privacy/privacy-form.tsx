'use client';

import type { PrivacySettings } from '@academia/contracts';
import { Alert, Button, Input, Label } from '@academia/ui';
import { useId, useState } from 'react';
import { callApi, UNAVAILABLE } from '../../lib/api.ts';

const SAVED = 'Configurações salvas.';
const GENERIC_MESSAGE = 'Não foi possível salvar. Tente novamente.';

type Field = keyof PrivacySettings;

/** O que foi digitado vira número quando é número; o resto segue como texto, e a API diz o que está errado. */
const valueOf = (typed: string): number | string => (/^\s*-?\d+(\.\d+)?\s*$/.test(typed) ? Number(typed) : typed);

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
        <div className="flex items-center gap-2">
          <Input
            id={yearsId}
            inputMode="numeric"
            className="w-24"
            value={off ? '' : years}
            disabled={off}
            aria-invalid={errors.inactiveStudentRetentionYears ? true : undefined}
            aria-describedby={errors.inactiveStudentRetentionYears ? `${yearsId}-error` : undefined}
            onChange={(event) => setYears(event.target.value)}
          />
          <span>anos</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={off} onChange={(event) => setOff(event.target.checked)} />
          Desligado
        </label>
        {errors.inactiveStudentRetentionYears && (
          <p id={`${yearsId}-error`} className="text-sm text-[#f87171]">
            {errors.inactiveStudentRetentionYears}
          </p>
        )}
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor={daysId}>Guardar versões de foto por</Label>
        <div className="flex items-center gap-2">
          <Input
            id={daysId}
            inputMode="numeric"
            className="w-24"
            value={days}
            aria-invalid={errors.photoVersionRetentionDays ? true : undefined}
            aria-describedby={errors.photoVersionRetentionDays ? `${daysId}-error` : undefined}
            onChange={(event) => setDays(event.target.value)}
          />
          <span>dias</span>
        </div>
        {errors.photoVersionRetentionDays && (
          <p id={`${daysId}-error`} className="text-sm text-[#f87171]">
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
