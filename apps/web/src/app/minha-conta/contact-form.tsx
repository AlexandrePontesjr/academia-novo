'use client';

import type { MyProfile, UpdateMyProfileRequest } from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, UNAVAILABLE } from '../../lib/api.ts';
import { formatCpf, formatPhone } from '../../lib/students.ts';

/** Os únicos campos que o aluno altera: e-mail e CPF só mudam pela equipe (AC 39, AC 40). */
const FIELDS = [
  { key: 'phone', label: 'Telefone', inputMode: 'tel' },
  { key: 'address', label: 'Endereço' },
  { key: 'emergencyContactName', label: 'Contato de emergência (nome)' },
  { key: 'emergencyContactPhone', label: 'Contato de emergência (telefone)', inputMode: 'tel' },
] as const;

type Key = (typeof FIELDS)[number]['key'];
type FormValues = Record<Key, string>;

const valuesOf = (profile: MyProfile): FormValues => ({
  phone: formatPhone(profile.phone),
  address: profile.address ?? '',
  emergencyContactName: profile.emergencyContactName ?? '',
  emergencyContactPhone: formatPhone(profile.emergencyContactPhone ?? ''),
});

/** Os dados de contato do aluno: salvar manda só o que mudou, e o `422` aparece junto de cada campo (AC 42). */
export function ContactForm({ profile }: { profile: MyProfile }) {
  const form = useForm<FormValues>({ defaultValues: valuesOf(profile) });
  const { errors, isSubmitting } = form.formState;
  const [saved, setSaved] = useState(false);
  const [alert, setAlert] = useState<string>();

  async function submit(values: FormValues) {
    setSaved(false);
    setAlert(undefined);
    const body: UpdateMyProfileRequest = {};
    for (const { key } of FIELDS) {
      if (values[key] === form.formState.defaultValues?.[key]) continue;
      // o campo esvaziado limpa o dado; o telefone não pode ficar vazio, e quem diz é a API
      (body as Record<Key, string | null>)[key] = key !== 'phone' && values[key].trim() === '' ? null : values[key];
    }

    const result = await callApi<MyProfile>('PATCH', '/api/me/profile', body);
    if (result.kind === 'ok') {
      form.reset(valuesOf(result.data));
      setSaved(true);
    } else if (result.kind === 'validation') {
      showFieldErrors(form, result.errors);
    } else {
      setAlert(UNAVAILABLE);
    }
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">E-mail</dt>
          <dd className="break-words">{profile.email ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">CPF</dt>
          <dd>{formatCpf(profile.cpf)}</dd>
        </div>
      </dl>
      {FIELDS.map(({ key, label, ...input }) => (
        <TextField key={key} label={label} error={errors[key]?.message} registration={form.register(key)} {...input} />
      ))}
      {alert && <Alert variant="destructive">{alert}</Alert>}
      {saved && <p role="status">Dados atualizados.</p>}
      <div>
        <Button type="submit" busy={isSubmitting}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
