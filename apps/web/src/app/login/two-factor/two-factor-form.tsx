'use client';

import {
  type LoginResponse,
  type TwoFactorVerifyRequest,
  twoFactorVerifyRequestSchema,
} from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../../components/text-field.tsx';
import { callApi, showFieldErrors, tooManyAttempts, UNAVAILABLE } from '../../../lib/api.ts';

export function TwoFactorForm() {
  const [recovery, setRecovery] = useState(false);
  const [alert, setAlert] = useState<string>();
  // só o campo em uso é enviado: `code` ou `backupCode`, nunca os dois
  const form = useForm<TwoFactorVerifyRequest>({
    resolver: zodResolver(twoFactorVerifyRequestSchema),
    shouldUnregister: true,
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: TwoFactorVerifyRequest) {
    setAlert(undefined);
    const result = await callApi<LoginResponse>('POST', '/api/auth/two-factor/verify', values);

    if (result.kind === 'ok') window.location.assign('/dashboard');
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else if (result.kind === 'unavailable') setAlert(UNAVAILABLE);
    else if (result.status === 429) setAlert(tooManyAttempts(result.retryAfter));
    else setAlert('Código inválido.');
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      {recovery ? (
        <TextField
          key="backupCode"
          label="Código de recuperação"
          autoComplete="off"
          error={errors.backupCode?.message}
          registration={form.register('backupCode')}
        />
      ) : (
        <TextField
          key="code"
          label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          error={errors.code?.message}
          registration={form.register('code')}
        />
      )}
      <Button type="submit" busy={isSubmitting}>
        Verificar
      </Button>
      <a
        href="#"
        className="text-sm underline"
        onClick={(event) => {
          event.preventDefault();
          setAlert(undefined);
          form.clearErrors();
          setRecovery(!recovery);
        }}
      >
        {recovery ? 'Usar código do aplicativo' : 'Usar código de recuperação'}
      </a>
    </form>
  );
}
