import { Shell } from '../../components/shell.tsx';
import { canCheckIn } from '../../lib/check-ins.ts';
import { requireSession } from '../../lib/session.ts';
import { CheckInDesk } from './check-in-desk.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';

export const dynamic = 'force-dynamic';

export default async function CheckInPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <h2 className="text-2xl font-bold">Check-in</h2>
      <div className={PAGE_BODY}>
        {/* quem não registra presença não chega a buscar aluno; a API recusaria de qualquer forma */}
        {canCheckIn(session.user.role) ? <CheckInDesk /> : <p>Você não tem permissão para acessar esta página.</p>}
      </div>
    </Shell>
  );
}
