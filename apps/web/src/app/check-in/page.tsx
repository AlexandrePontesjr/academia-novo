import { Shell } from '../../components/shell.tsx';
import { canCheckIn } from '../../lib/check-ins.ts';
import { requireSession } from '../../lib/session.ts';
import { CheckInDesk } from './check-in-desk.tsx';

export const dynamic = 'force-dynamic';

export default async function CheckInPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <h2 className="text-lg font-semibold">Check-in</h2>
      {/* quem não registra presença não chega a buscar aluno; a API recusaria de qualquer forma */}
      {canCheckIn(session.user.role) ? <CheckInDesk /> : <p>Você não tem permissão para acessar esta página.</p>}
    </Shell>
  );
}
