'use client';

import { type ChangePasswordRequest, changePasswordRequestSchema } from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, UNAVAILABLE } from '../../lib/api.ts';

export function ChangePasswordForm() {
  const [notice, setNotice] = useState<{ text: string; failed: boolean }>();
  const form = useForm<ChangePasswordRequest>({
    resolver: zodResolver(changePasswordRequestSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: ChangePasswordRequest) {
    setNotice(undefined);
    const result = await callApi('PUT', '/api/auth/password', values);

    if (result.kind === 'ok') {
      form.reset();
      setNotice({ text: 'Senha alterada.', failed: false });
    } else if (result.kind === 'validation') {
      showFieldErrors(form, result.errors);
    } else {
      setNotice({
        text: result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível trocar a senha.',
        failed: true,
      });
    }
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      {notice && <Alert variant={notice.failed ? 'destructive' : 'default'}>{notice.text}</Alert>}
      <TextField
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        registration={form.register('currentPassword')}
      />
      <TextField
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        error={errors.newPassword?.message}
        registration={form.register('newPassword')}
      />
      <Button type="submit" disabled={isSubmitting}>
        Trocar senha
      </Button>
    </form>
  );
}
