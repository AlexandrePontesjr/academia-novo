import { Shell } from '../../components/shell.tsx';
import { requireSession } from '../../lib/session.ts';
import { ChangePasswordForm } from './change-password-form.tsx';
import { TwoFactorToggle } from './two-factor-toggle.tsx';
import { PANEL } from '@academia/ui';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <section className={`grid gap-4 md:max-w-md ${PANEL}`}>
        <h2 className="text-2xl font-bold">Trocar senha</h2>
        <ChangePasswordForm />
      </section>
      <section className={`grid gap-4 md:max-w-md ${PANEL}`}>
        <h2 className="text-2xl font-bold">Verificação em duas etapas</h2>
        <TwoFactorToggle enabled={session.user.twoFactorEnabled} />
      </section>
    </Shell>
  );
}
