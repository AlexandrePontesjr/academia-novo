import { Shell } from '../../components/shell.tsx';
import { requireSession } from '../../lib/session.ts';
import { ChangePasswordForm } from './change-password-form.tsx';
import { TwoFactorToggle } from './two-factor-toggle.tsx';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <section className="grid max-w-sm gap-4">
        <h2 className="text-lg font-semibold">Trocar senha</h2>
        <ChangePasswordForm />
      </section>
      <section className="grid max-w-sm gap-4">
        <h2 className="text-lg font-semibold">Verificação em duas etapas</h2>
        <TwoFactorToggle enabled={session.user.twoFactorEnabled} />
      </section>
    </Shell>
  );
}
