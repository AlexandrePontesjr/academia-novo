import { PANEL, ScreenHeader } from '@academia/ui';
import { Shell } from '../../components/shell.tsx';
import { requireSession } from '../../lib/session.ts';
import { ChangePasswordForm } from './change-password-form.tsx';
import { TwoFactorToggle } from './two-factor-toggle.tsx';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <ScreenHeader title="Minha conta" />
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section aria-labelledby="password-heading" className={`grid content-start gap-4 ${PANEL}`}>
          <h3 id="password-heading" className="text-xl font-medium">
            Trocar senha
          </h3>
          <ChangePasswordForm />
        </section>
        <section aria-labelledby="two-factor-heading" className={`grid content-start gap-4 ${PANEL}`}>
          <h3 id="two-factor-heading" className="text-xl font-medium">
            Verificação em duas etapas
          </h3>
          <TwoFactorToggle enabled={session.user.twoFactorEnabled} />
        </section>
      </div>
    </Shell>
  );
}
