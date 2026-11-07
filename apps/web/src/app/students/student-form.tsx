'use client';

import {
  createStudentRequestSchema,
  GUARDIAN_RELATIONSHIPS,
  type Guardian,
  isMinor,
  saoPauloToday,
  type Student,
  STUDENT_SEXES,
  updateStudentRequestSchema,
} from '@academia/contracts';
import { Alert, Button, Label, Select } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, UNAVAILABLE } from '../../lib/api.ts';
import { RELATIONSHIP_LABELS } from '../../lib/consents.ts';
import { LEAD_CONFLICT_MESSAGES } from '../../lib/leads.ts';
import { formatCpf, formatPhone, SEX_LABELS } from '../../lib/students.ts';

interface FormValues {
  name: string;
  cpf: string;
  birthDate: string;
  sex: string;
  email: string;
  phone: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  healthNotes: string;
  guardian: { name: string; cpf: string; phone: string; relationship: string };
}

const OPTIONAL = ['sex', 'email', 'address', 'emergencyContactName', 'emergencyContactPhone', 'healthNotes'] as const;

/** O interessado que o cadastro converte: o que a lista sabe dele preenche o formulário (pre-cadastro). */
export interface LeadPrefill {
  id: string;
  name?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
}

function defaultsOf(student?: Student, guardian?: Guardian | null, lead?: LeadPrefill): FormValues {
  return {
    name: student?.name ?? lead?.name ?? '',
    cpf: formatCpf(student?.cpf ?? ''),
    birthDate: student?.birthDate ?? '',
    sex: student?.sex ?? '',
    email: student?.email ?? lead?.email ?? '',
    phone: formatPhone(student?.phone ?? lead?.phone ?? ''),
    address: student?.address ?? '',
    emergencyContactName: student?.emergencyContactName ?? '',
    emergencyContactPhone: formatPhone(student?.emergencyContactPhone ?? ''),
    healthNotes: student?.healthNotes ?? '',
    guardian: {
      name: guardian?.name ?? '',
      cpf: formatCpf(guardian?.cpf ?? ''),
      phone: formatPhone(guardian?.phone ?? ''),
      relationship: guardian?.relationship ?? '',
    },
  };
}

/**
 * O corpo da requisição com o que foi digitado: os quatro campos obrigatórios aparados e, dos
 * opcionais, só os preenchidos. Na edição, o campo opcional em branco vai como `null`, que o limpa.
 */
function bodyOf(values: FormValues, editing: boolean, withGuardian: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: values.name.trim(),
    cpf: values.cpf.trim(),
    birthDate: values.birthDate,
    phone: values.phone.trim(),
  };
  for (const key of OPTIONAL) {
    // as observações de saúde seguem como digitadas: a ficha as devolve como foram enviadas
    const value = key === 'healthNotes' ? values[key] : values[key].trim();
    if (value.trim() !== '') body[key] = value;
    else if (editing) body[key] = null;
  }
  // só o menor envia o responsável: o bloco só existe para ele
  if (withGuardian) {
    const { name, cpf, phone, relationship } = values.guardian;
    body.guardian = { name: name.trim(), cpf: cpf.trim(), phone: phone.trim(), relationship };
  }
  return body;
}

/** Formulário de cadastro (`/students/new`) e de edição (`/students/<id>/edit`) de aluno. */
export function StudentForm({ student, guardian, lead }: { student?: Student; guardian?: Guardian | null; lead?: LeadPrefill }) {
  const router = useRouter();
  const sexId = useId();
  const notesId = useId();
  const [alert, setAlert] = useState<string>();
  const guardianRelationshipId = useId();
  const form = useForm<FormValues>({ defaultValues: defaultsOf(student, guardian, lead) });
  const { errors, isSubmitting } = form.formState;
  // o dia de hoje só é lido depois da hidratação: o servidor e o navegador podem discordar do dia
  const [today, setToday] = useState<string>();
  useEffect(() => setToday(saoPauloToday()), []);
  const birthDate = form.watch('birthDate');
  const showGuardian = today !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && isMinor(birthDate, today);

  async function submit(values: FormValues) {
    setAlert(undefined);
    const body = bodyOf(values, student !== undefined, showGuardian);
    if (lead) body.leadId = lead.id;
    // a mesma conferência que a API faz, antes de enviar
    const checked = (student ? updateStudentRequestSchema : createStudentRequestSchema).safeParse(body);
    if (!checked.success) {
      const byPath = new Map<string, string>();
      for (const issue of checked.error.issues) if (!byPath.has(issue.path.join('.'))) byPath.set(issue.path.join('.'), issue.message);
      showFieldErrors(form, [...byPath].map(([path, message]) => ({ path, message })));
      return;
    }

    const result = student
      ? await callApi<Student>('PATCH', `/api/students/${student.id}`, body)
      : await callApi<Student>('POST', '/api/students', body);

    if (result.kind === 'ok') router.push(`/students/${student?.id ?? result.data.id}`);
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else if (result.kind === 'problem' && result.code === 'cpf_taken') {
      form.setError('cpf', { message: 'Já existe um aluno com este CPF.' });
    } else if (result.kind === 'problem' && LEAD_CONFLICT_MESSAGES[result.code]) {
      setAlert(LEAD_CONFLICT_MESSAGES[result.code]);
    } else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível concluir. Tente novamente.');
  }

  return (
    <form noValidate className="grid max-w-xl gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField label="Nome completo" autoComplete="off" error={errors.name?.message} registration={form.register('name')} />
      <TextField label="CPF" inputMode="numeric" autoComplete="off" error={errors.cpf?.message} registration={form.register('cpf')} />
      <TextField
        label="Data de nascimento"
        type="date"
        error={errors.birthDate?.message}
        registration={form.register('birthDate')}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={sexId}>Sexo</Label>
        <Select
          id={sexId}
          aria-invalid={errors.sex ? true : undefined}
          aria-describedby={errors.sex ? `${sexId}-error` : undefined}
          {...form.register('sex')}
        >
          <option value=""></option>
          {STUDENT_SEXES.map((sex) => (
            <option key={sex} value={sex}>
              {SEX_LABELS[sex]}
            </option>
          ))}
        </Select>
        {errors.sex && (
          <p id={`${sexId}-error`} className="text-sm text-status-bad">
            {errors.sex.message}
          </p>
        )}
      </div>
      {showGuardian && (
        <fieldset className="grid gap-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">Responsável legal</legend>
          {errors.guardian?.message && <p className="text-sm text-status-bad">{errors.guardian.message}</p>}
          <TextField
            label="Nome do responsável"
            autoComplete="off"
            error={errors.guardian?.name?.message}
            registration={form.register('guardian.name')}
          />
          <TextField
            label="CPF do responsável"
            inputMode="numeric"
            autoComplete="off"
            error={errors.guardian?.cpf?.message}
            registration={form.register('guardian.cpf')}
          />
          <TextField
            label="Telefone do responsável"
            type="tel"
            autoComplete="off"
            error={errors.guardian?.phone?.message}
            registration={form.register('guardian.phone')}
          />
          <div className="grid gap-1.5">
            <Label htmlFor={guardianRelationshipId}>Parentesco</Label>
            <Select
              id={guardianRelationshipId}
              aria-invalid={errors.guardian?.relationship ? true : undefined}
              aria-describedby={errors.guardian?.relationship ? `${guardianRelationshipId}-error` : undefined}
              {...form.register('guardian.relationship')}
            >
              <option value=""></option>
              {GUARDIAN_RELATIONSHIPS.map((relationship) => (
                <option key={relationship} value={relationship}>
                  {RELATIONSHIP_LABELS[relationship]}
                </option>
              ))}
            </Select>
            {errors.guardian?.relationship && (
              <p id={`${guardianRelationshipId}-error`} className="text-sm text-status-bad">
                {errors.guardian.relationship.message}
              </p>
            )}
          </div>
        </fieldset>
      )}
      <TextField label="E-mail" type="email" autoComplete="off" error={errors.email?.message} registration={form.register('email')} />
      <TextField label="Telefone" type="tel" autoComplete="off" error={errors.phone?.message} registration={form.register('phone')} />
      <TextField label="Endereço" autoComplete="off" error={errors.address?.message} registration={form.register('address')} />
      <TextField
        label="Contato de emergência (nome)"
        autoComplete="off"
        error={errors.emergencyContactName?.message}
        registration={form.register('emergencyContactName')}
      />
      <TextField
        label="Contato de emergência (telefone)"
        type="tel"
        autoComplete="off"
        error={errors.emergencyContactPhone?.message}
        registration={form.register('emergencyContactPhone')}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={notesId}>Observações de saúde</Label>
        <textarea
          id={notesId}
          rows={4}
          aria-invalid={errors.healthNotes ? true : undefined}
          aria-describedby={errors.healthNotes ? `${notesId}-error` : undefined}
          className="w-full rounded-xl border border-border-control bg-card px-4 py-2.5 text-sm text-foreground aria-invalid:border-status-bad"
          {...form.register('healthNotes')}
        />
        {errors.healthNotes && (
          <p id={`${notesId}-error`} className="text-sm text-status-bad">
            {errors.healthNotes.message}
          </p>
        )}
      </div>
      <div>
        <Button type="submit" busy={isSubmitting}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
