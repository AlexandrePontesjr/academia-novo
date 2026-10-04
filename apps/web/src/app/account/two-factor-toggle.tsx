'use client';

import { type PasswordConfirmationRequest, passwordConfirmationRequestSchema } from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, UNAVAILABLE } from '../../lib/api.ts';

/** Com o 2FA desligado, leva ao cadastro; ligado, desliga pedindo a senha de novo. */
export function TwoFactorToggle({ enabled }: { enabled: boolean }) {
  const [asking, setAsking] = useState(false);
  const [alert, setAlert] = useState<string>();
  const form = useForm<PasswordConfirmationRequest>({
    resolver: zodResolver(passwordConfirmationRequestSchema),
    defaultValues: { password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  if (!enabled) {
    return (
      <Button asChild variant="outline">
        <a href="/two-factor/setup">Ativar verificação em duas etapas</a>
      </Button>
    );
  }
  if (!asking) {
    return (
      <Button variant="outline" onClick={() => setAsking(true)}>
        Desativar verificação em duas etapas
      </Button>
    );
  }

  async function submit(values: PasswordConfirmationRequest) {
    setAlert(undefined);
    const result = await callApi('POST', '/api/auth/two-factor/disable', values);

    if (result.kind === 'ok') window.location.reload();
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível desativar.');
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField
        label="Senha"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        registration={form.register('password')}
      />
      <Button type="submit" variant="destructive" disabled={isSubmitting}>
        Desativar verificação em duas etapas
      </Button>
    </form>
  );
}
