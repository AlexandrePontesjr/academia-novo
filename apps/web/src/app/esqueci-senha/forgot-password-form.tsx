'use client';

import { type PasswordResetRequest, passwordResetRequestSchema } from '@academia/contracts';
import { Alert, Button, MailIcon } from '@academia/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, tooManyAttempts, UNAVAILABLE } from '../../lib/api.ts';

const SENT = 'Se o e-mail for de um aluno com acesso, enviamos um link. Ele vale por 1 hora.';

/** O pedido de redefinição: a mesma mensagem em todo caso aceito (AC 30). */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [alert, setAlert] = useState<string>();
  const form = useForm<PasswordResetRequest>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: PasswordResetRequest) {
    setAlert(undefined);
    const result = await callApi('POST', '/api/password-reset', values);

    if (result.kind === 'ok') setSent(true);
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else if (result.kind === 'problem' && result.status === 429) setAlert(tooManyAttempts(result.retryAfter));
    else setAlert(UNAVAILABLE);
  }

  if (sent) {
    return (
      <p role="status" className="text-lg">
        {SENT}
      </p>
    );
  }
  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField
        label="E-mail"
        icon={<MailIcon className="size-4" />}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        registration={form.register('email')}
      />
      <Button type="submit" className="h-12 w-full" busy={isSubmitting}>
        Enviar link
      </Button>
    </form>
  );
}
