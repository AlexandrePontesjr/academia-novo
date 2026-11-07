'use client';

import { createStaffRequestSchema, type Staff, updateStaffRequestSchema } from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, UNAVAILABLE } from '../../lib/api.ts';
import { formatCpf, formatPhone } from '../../lib/students.ts';

interface FormValues {
  name: string;
  cpf: string;
  position: string;
  department: string;
  hiredAt: string;
  phone: string;
  email: string;
}

const REQUIRED = ['name', 'cpf', 'position', 'hiredAt', 'phone'] as const;
const OPTIONAL = ['department', 'email'] as const;

function defaultsOf(staff?: Staff): FormValues {
  return {
    name: staff?.name ?? '',
    cpf: formatCpf(staff?.cpf ?? ''),
    position: staff?.position ?? '',
    department: staff?.department ?? '',
    hiredAt: staff?.hiredAt ?? '',
    phone: formatPhone(staff?.phone ?? ''),
    email: staff?.email ?? '',
  };
}

/**
 * O corpo da requisição com o que foi digitado. No cadastro, os cinco obrigatórios aparados e, dos
 * opcionais, só os preenchidos. Na edição, só o que mudou em relação à ficha aberta; o opcional
 * apagado vai como `null`, que o limpa.
 */
function bodyOf(values: FormValues, initial: FormValues | undefined): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of REQUIRED) {
    const value = values[key].trim();
    if (!initial || value !== initial[key].trim()) body[key] = value;
  }
  for (const key of OPTIONAL) {
    const value = values[key].trim();
    if (initial ? value !== initial[key].trim() : value !== '') body[key] = value === '' ? null : value;
  }
  return body;
}

/** Formulário de cadastro (`/staff/new`) e de edição (`/staff/<id>/edit`) de funcionário. */
export function StaffForm({ staff }: { staff?: Staff }) {
  const router = useRouter();
  const [alert, setAlert] = useState<string>();
  const initial = staff ? defaultsOf(staff) : undefined;
  const form = useForm<FormValues>({ defaultValues: defaultsOf(staff) });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: FormValues) {
    setAlert(undefined);
    const body = bodyOf(values, initial);
    // a mesma conferência que a API faz, antes de enviar
    const checked = (staff ? updateStaffRequestSchema : createStaffRequestSchema).safeParse(body);
    if (!checked.success) {
      const byPath = new Map<string, string>();
      for (const issue of checked.error.issues) {
        if (!byPath.has(issue.path.join('.'))) byPath.set(issue.path.join('.'), issue.message);
      }
      showFieldErrors(form, [...byPath].map(([path, message]) => ({ path, message })));
      return;
    }

    const result = staff
      ? await callApi<Staff>('PATCH', `/api/staff/${staff.id}`, body)
      : await callApi<Staff>('POST', '/api/staff', body);

    if (result.kind === 'ok') router.push(`/staff/${staff?.id ?? result.data.id}`);
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else if (result.kind === 'problem' && result.code === 'cpf_taken') {
      form.setError('cpf', { message: 'Já existe um funcionário com este CPF.' });
    } else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível concluir. Tente novamente.');
  }

  return (
    <form noValidate className="grid max-w-xl gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField label="Nome completo" autoComplete="off" error={errors.name?.message} registration={form.register('name')} />
      <TextField label="CPF" inputMode="numeric" autoComplete="off" error={errors.cpf?.message} registration={form.register('cpf')} />
      <TextField label="Cargo" autoComplete="off" error={errors.position?.message} registration={form.register('position')} />
      <TextField label="Setor" autoComplete="off" error={errors.department?.message} registration={form.register('department')} />
      <TextField
        label="Data de admissão"
        type="date"
        error={errors.hiredAt?.message}
        registration={form.register('hiredAt')}
      />
      <TextField label="Telefone" type="tel" autoComplete="off" error={errors.phone?.message} registration={form.register('phone')} />
      <TextField label="E-mail" type="email" autoComplete="off" error={errors.email?.message} registration={form.register('email')} />
      <div>
        <Button type="submit" busy={isSubmitting}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
