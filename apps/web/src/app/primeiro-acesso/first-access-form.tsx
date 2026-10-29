'use client';

import { type FirstAccessRequest, firstAccessRequestSchema } from '@academia/contracts';
import { Alert, Button, MailIcon } from '@academia/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, tooManyAttempts, UNAVAILABLE } from '../../lib/api.ts';

const SENT =
  'Se o CPF e o e-mail forem de um aluno com cadastro, enviamos um link para o e-mail da ficha. Ele vale por 24 horas. Se você já tem senha, use Esqueci minha senha.';

/** O pedido do primeiro acesso: a mesma mensagem em todo caso aceito, seja qual for a decisão da API (AC 17). */
export function FirstAccessForm() {
  const [sent, setSent] = useState(false);
  const [alert, setAlert] = useState<string>();
  const form = useForm<FirstAccessRequest>({
    resolver: zodResolver(firstAccessRequestSchema),
    defaultValues: { cpf: '', email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: FirstAccessRequest) {
    setAlert(undefined);
    const result = await callApi('POST', '/api/portal/first-access', values);

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
      <TextField label="CPF" inputMode="numeric" autoComplete="off" error={errors.cpf?.message} registration={form.register('cpf')} />
      <TextField
        label="E-mail"
        icon={<MailIcon className="size-4" />}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        registration={form.register('email')}
      />
      <Button type="submit" className="h-12 w-full" busy={isSubmitting}>
        Pedir acesso
      </Button>
    </form>
  );
}
