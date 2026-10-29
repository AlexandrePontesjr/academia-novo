import { PortalFrame } from '../../components/portal-frame.tsx';
import { SetPasswordForm } from './set-password-form.tsx';

export const dynamic = 'force-dynamic';

/** A página do link do e-mail: abrir não consome o token, só o envio do formulário (AC 24). */
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;

  return (
    <PortalFrame title="Definir senha" intro="Escolha uma senha com pelo menos 12 caracteres.">
      <SetPasswordForm token={typeof token === 'string' ? token : ''} />
    </PortalFrame>
  );
}
