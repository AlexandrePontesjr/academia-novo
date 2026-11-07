'use client';

import {
  createLeadRequestSchema,
  type LeadCreatedResponse,
  type LeadGoogleProfile,
  type LeadOptionsResponse,
} from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { callApi, showFieldErrors, UNAVAILABLE } from '../../lib/api.ts';
import { SITE } from '../site-content.ts';

interface FormValues {
  name: string;
  email: string;
  phone: string;
  adult: boolean;
  consent: boolean;
  /** A armadilha (door 4): uma pessoa não a vê nem a preenche. */
  website: string;
}

const TEXT = SITE.matricula;

/** Uma caixa de seleção com o rótulo e a mensagem de erro dela, ligada por `aria-describedby`. */
function CheckField({ label, error, registration }: { label: string; error?: string | undefined; registration: UseFormRegisterReturn }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...registration}
        />
        {label}
      </label>
      {error && (
        <p id={`${id}-error`} className="text-sm text-status-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * O formulário público do pré-cadastro (`/matricula`). Confere pelo schema do contrato antes de enviar;
 * com o perfil do Google, nome e e-mail são os dele e não se editam.
 */
export function LeadForm({ options, google }: { options: LeadOptionsResponse; google: 'ok' | 'erro' | undefined }) {
  const router = useRouter();
  const [alert, setAlert] = useState<string>(google === 'erro' ? TEXT.googleError : '');
  const [profile, setProfile] = useState<LeadGoogleProfile>();
  const [profileChecked, setProfileChecked] = useState(google !== 'ok');
  const form = useForm<FormValues>({
    defaultValues: { name: '', email: '', phone: '', adult: false, consent: false, website: '' },
  });
  const { errors, isSubmitting } = form.formState;

  // o cookie do perfil só vai para `/api/leads`: quem o lê é o navegador, não o servidor da página
  useEffect(() => {
    if (google !== 'ok') return;
    void callApi<LeadGoogleProfile>('GET', '/api/leads/google/profile').then((result) => {
      if (result.kind === 'ok') setProfile(result.data);
      setProfileChecked(true);
    });
  }, [google]);

  async function submit(values: FormValues) {
    setAlert('');
    const body = {
      name: profile ? profile.name : values.name.trim(),
      email: profile ? profile.email : values.email.trim(),
      phone: values.phone.trim(),
      adult: values.adult,
      termVersion: options.term.version,
      website: values.website,
    };
    // a mesma conferência que a API faz, antes de enviar; o aceite do termo é só da tela
    const checked = createLeadRequestSchema.safeParse(body);
    const issues = new Map<string, string>();
    for (const issue of checked.error?.issues ?? []) {
      const path = issue.path.join('.');
      if (!issues.has(path)) issues.set(path, issue.message);
    }
    if (!values.consent) issues.set('consent', TEXT.consentRequired);
    if (issues.size > 0) {
      showFieldErrors(form, [...issues].map(([path, message]) => ({ path, message })));
      return;
    }

    const result = await callApi<LeadCreatedResponse>('POST', '/api/leads', body);
    if (result.kind === 'ok') router.push(result.data.status === 'confirmed' ? '/matricula/enviado?confirmado=1' : '/matricula/enviado');
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else if (result.kind === 'problem' && result.status === 429) setAlert(TEXT.tooMany);
    else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível concluir. Tente novamente.');
  }

  if (!profileChecked) return null;

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      {options.google && !profile && (
        <Button asChild variant="outline" className="h-12 w-full">
          {/* um redirect do servidor para o Google: nenhum script de terceiro na página (door 7) */}
          <a href="/api/leads/google/start">{TEXT.google}</a>
        </Button>
      )}
      {profile ? (
        <dl className="grid gap-1 rounded-xl border p-4 text-sm" data-slot="google-profile">
          <dt className="text-muted-foreground">{TEXT.googleAccount}</dt>
          <dd className="font-medium">{profile.name}</dd>
          <dd>{profile.email}</dd>
        </dl>
      ) : (
        <>
          <TextField label={TEXT.fields.name} autoComplete="name" error={errors.name?.message} registration={form.register('name')} />
          <TextField
            label={TEXT.fields.email}
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            registration={form.register('email')}
          />
        </>
      )}
      <TextField
        label={TEXT.fields.tel}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        registration={form.register('phone')}
      />
      {/* a armadilha fica fora da tela e da ordem de foco: só um robô a preenche */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Site
          <input type="text" tabIndex={-1} autoComplete="off" {...form.register('website')} />
        </label>
      </div>
      <CheckField label={TEXT.adult} error={errors.adult?.message} registration={form.register('adult')} />
      <CheckField label={TEXT.consent} error={errors.consent?.message} registration={form.register('consent')} />
      <details className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">{TEXT.term}</summary>
        <p className="mt-3 whitespace-pre-wrap text-muted-foreground" data-slot="term-text">
          {options.term.text}
        </p>
      </details>
      <Button type="submit" className="h-12 w-full" busy={isSubmitting}>
        {TEXT.submit}
      </Button>
    </form>
  );
}
