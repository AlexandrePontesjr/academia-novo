'use client';

import { type LoginRequest, loginRequestSchema, type LoginResponse } from '@academia/contracts';
import { Alert, Button, LockIcon, MailIcon } from '@academia/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, tooManyAttempts, UNAVAILABLE } from '../../lib/api.ts';

export function LoginForm() {
  const router = useRouter();
  const [alert, setAlert] = useState<string>();
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: LoginRequest) {
    setAlert(undefined);
    const result = await callApi<LoginResponse>('POST', '/api/auth/login', values);

    if (result.kind === 'ok') {
      if (result.data.status === 'two_factor_required') router.push('/login/two-factor');
      else window.location.assign('/dashboard');
    } else if (result.kind === 'validation') {
      showFieldErrors(form, result.errors);
    } else if (result.kind === 'unavailable') {
      setAlert(UNAVAILABLE);
    } else if (result.status === 429) {
      setAlert(tooManyAttempts(result.retryAfter));
    } else {
      form.resetField('password');
      setAlert('E-mail ou senha incorretos.');
    }
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField
        label="E-mail"
        icon={<MailIcon className="size-4" />}
        type="email"
        autoComplete="username"
        error={errors.email?.message}
        registration={form.register('email')}
      />
      <TextField
        label="Senha"
        icon={<LockIcon className="size-4" />}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        registration={form.register('password')}
      />
      <Button type="submit" className="h-12 w-full" disabled={isSubmitting}>
        Entrar
      </Button>
    </form>
  );
}
