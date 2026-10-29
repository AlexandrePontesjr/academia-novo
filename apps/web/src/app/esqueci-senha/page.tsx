import { PortalFrame } from '../../components/portal-frame.tsx';
import { ForgotPasswordForm } from './forgot-password-form.tsx';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <PortalFrame title="Esqueci minha senha" intro="Informe o e-mail com que você entra no portal.">
      <ForgotPasswordForm />
    </PortalFrame>
  );
}
