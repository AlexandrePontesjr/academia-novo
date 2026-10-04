import { requireSession } from '../../../lib/session.ts';
import { TwoFactorSetup } from './two-factor-setup.tsx';

export const dynamic = 'force-dynamic';

export default async function TwoFactorSetupPage() {
  await requireSession();

  return (
    <main className="mx-auto grid max-w-md gap-6 p-6 pt-16">
      <h1 className="text-2xl font-semibold">Ativar verificação em duas etapas</h1>
      <TwoFactorSetup />
    </main>
  );
}
