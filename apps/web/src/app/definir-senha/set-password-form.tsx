'use client';

import { INVALID_PASSWORD_LINK_MESSAGE, newPasswordSchema } from '@academia/contracts';
import { Alert, Button, LockIcon } from '@academia/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { TextField } from '../../components/text-field.tsx';
import { callApi, UNAVAILABLE } from '../../lib/api.ts';

const formSchema = z
  .object({ password: newPasswordSchema, confirmation: z.string() })
  .refine((values) => values.password === values.confirmation, { path: ['confirmation'], message: 'As senhas não conferem.' });
type FormValues = z.infer<typeof formSchema>;

/** O formulário da senha nova: só o envio chama a API, e o sucesso leva ao login (AC 24, AC 25). */
export function SetPasswordForm({ token }: { token: string }) {
  const [alert, setAlert] = useState<string>();
  const [invalidLink, setInvalidLink] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { password: '', confirmation: '' } });
  const { errors, isSubmitting } = form.formState;

  async function submit({ password }: FormValues) {
    setAlert(undefined);
    const result = await callApi('POST', '/api/password-tokens/consume', { token, password });

    if (result.kind === 'ok') {
      window.location.assign('/login?senha=definida');
    } else if (result.kind === 'validation') {
      for (const error of result.errors) {
        if (error.path === 'token') setInvalidLink(true);
        else if (error.path === 'password') form.setError('password', { message: error.message });
      }
    } else {
      setAlert(UNAVAILABLE);
    }
  }

  if (invalidLink) {
    return (
      <div className="grid justify-items-start gap-4">
        <Alert variant="destructive">{INVALID_PASSWORD_LINK_MESSAGE}</Alert>
        <div className="flex gap-4">
          <Link href="/primeiro-acesso" className="text-primary underline underline-offset-4">
            Primeiro acesso
          </Link>
          <Link href="/esqueci-senha" className="text-primary underline underline-offset-4">
            Esqueci minha senha
          </Link>
        </div>
      </div>
    );
  }
  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField
        label="Nova senha"
        icon={<LockIcon className="size-4" />}
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        registration={form.register('password')}
      />
      <TextField
        label="Confirmar senha"
        icon={<LockIcon className="size-4" />}
        type="password"
        autoComplete="new-password"
        error={errors.confirmation?.message}
        registration={form.register('confirmation')}
      />
      <Button type="submit" className="h-12 w-full" busy={isSubmitting}>
        Definir senha
      </Button>
    </form>
  );
}
