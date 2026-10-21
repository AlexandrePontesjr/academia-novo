import { AuthFrame } from '../../../components/auth-frame.tsx';
import { requireSession } from '../../../lib/session.ts';
import { TwoFactorSetup } from './two-factor-setup.tsx';

export const dynamic = 'force-dynamic';

export default async function TwoFactorSetupPage() {
  await requireSession();

  return (
    <AuthFrame>
      <main className="grid w-full max-w-md gap-6 p-6 pt-16 lg:py-10">
        <h1 className="text-3xl font-medium">Ativar verificação em duas etapas</h1>
        <TwoFactorSetup />
      </main>
    </AuthFrame>
  );
}
