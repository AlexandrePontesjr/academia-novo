import { ScreenHeader } from '@academia/ui';
import { Shell } from '../../components/shell.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';
import { canUsePrivacy } from '../../lib/privacy.ts';
import { loadPrivacySettings } from '../../lib/privacy-server.ts';
import { requireSession } from '../../lib/session.ts';
import { PrivacyForm } from './privacy-form.tsx';
import { PrivacyLoadError } from './privacy-load-error.tsx';

export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const session = await requireSession();
  // quem não configura não chega a pedir a configuração; a API recusaria de qualquer forma
  const allowed = canUsePrivacy(session.user.role);
  const settings = allowed ? await loadPrivacySettings() : undefined;

  return (
    <Shell session={session}>
      <ScreenHeader title="Privacidade" />
      <div className={PAGE_BODY} data-slot="page-body">
        {!allowed ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : settings === 'failed' || !settings ? (
          <PrivacyLoadError />
        ) : (
          <PrivacyForm initial={settings} />
        )}
      </div>
    </Shell>
  );
}
