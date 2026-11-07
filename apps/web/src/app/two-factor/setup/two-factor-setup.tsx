'use client';

import {
  type PasswordConfirmationRequest,
  passwordConfirmationRequestSchema,
  type TwoFactorConfirmRequest,
  twoFactorConfirmRequestSchema,
  type TwoFactorEnableResponse,
} from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import QRCode from 'qrcode';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../../components/text-field.tsx';
import { callApi, showFieldErrors, UNAVAILABLE } from '../../../lib/api.ts';

const FAILED = 'Não foi possível concluir. Tente novamente.';

interface Enrollment extends TwoFactorEnableResponse {
  qrCode: string;
}

/** Três passos: confirmar a senha, ler o QR code e digitar o código, guardar os códigos de recuperação. */
export function TwoFactorSetup() {
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [confirmed, setConfirmed] = useState(false);

  if (!enrollment) return <PasswordStep onEnabled={setEnrollment} />;
  if (!confirmed) return <CodeStep enrollment={enrollment} onConfirmed={() => setConfirmed(true)} />;

  // os códigos só existem aqui, na memória desta tela: recarregada, ela não os tem mais
  return (
    <section className="grid gap-4">
      <Alert>Guarde estes códigos. Eles não serão exibidos novamente.</Alert>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
        {enrollment.backupCodes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button asChild>
        <a href="/dashboard">Continuar</a>
      </Button>
    </section>
  );
}

function PasswordStep({ onEnabled }: { onEnabled: (enrollment: Enrollment) => void }) {
  const [alert, setAlert] = useState<string>();
  const form = useForm<PasswordConfirmationRequest>({
    resolver: zodResolver(passwordConfirmationRequestSchema),
    defaultValues: { password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: PasswordConfirmationRequest) {
    setAlert(undefined);
    const result = await callApi<TwoFactorEnableResponse>('POST', '/api/auth/two-factor/enable', values);

    if (result.kind === 'ok') {
      onEnabled({ ...result.data, qrCode: await QRCode.toDataURL(result.data.totpUri, { margin: 2, scale: 6 }) });
    } else if (result.kind === 'validation') {
      showFieldErrors(form, result.errors);
    } else {
      setAlert(result.kind === 'unavailable' ? UNAVAILABLE : FAILED);
    }
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      <p className="text-sm text-muted-foreground">Confirme sua senha para gerar o QR code.</p>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField
        label="Senha"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        registration={form.register('password')}
      />
      <Button type="submit" busy={isSubmitting}>
        Continuar
      </Button>
    </form>
  );
}

function CodeStep({ enrollment, onConfirmed }: { enrollment: Enrollment; onConfirmed: () => void }) {
  const [alert, setAlert] = useState<string>();
  const form = useForm<TwoFactorConfirmRequest>({
    resolver: zodResolver(twoFactorConfirmRequestSchema),
    defaultValues: { code: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const secret = new URL(enrollment.totpUri).searchParams.get('secret');

  async function submit(values: TwoFactorConfirmRequest) {
    setAlert(undefined);
    const result = await callApi('POST', '/api/auth/two-factor/confirm', values);

    if (result.kind === 'ok') onConfirmed();
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : FAILED);
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      <p className="text-sm text-muted-foreground">
        Leia o QR code no aplicativo autenticador, ou digite o segredo, e informe o código gerado.
      </p>
      {/* imagem gerada aqui, em data URL: não há o que o otimizador de imagens do Next faça com ela */}
      <img src={enrollment.qrCode} alt="QR code" width={220} height={220} />
      <p className="text-sm">
        Segredo: <code className="font-mono break-all">{secret}</code>
      </p>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField
        label="Código de 6 dígitos"
        inputMode="numeric"
        autoComplete="one-time-code"
        error={errors.code?.message}
        registration={form.register('code')}
      />
      <Button type="submit" busy={isSubmitting}>
        Confirmar
      </Button>
    </form>
  );
}
