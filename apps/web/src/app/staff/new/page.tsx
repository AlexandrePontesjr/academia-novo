import { ScreenHeader } from '@academia/ui';
import { Shell } from '../../../components/shell.tsx';
import { PAGE_BODY } from '../../../components/page-body.ts';
import { requireSession } from '../../../lib/session.ts';
import { canAccessStaff } from '../../../lib/staff.ts';
import { StaffForm } from '../staff-form.tsx';

export const dynamic = 'force-dynamic';

export default async function NewStaffPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <ScreenHeader title="Novo funcionário" />
      <div className={PAGE_BODY} data-slot="page-body">
        {/* quem não cadastra não chega ao formulário; a API recusaria de qualquer forma */}
        {canAccessStaff(session.user.role) ? <StaffForm /> : <p>Você não tem permissão para acessar esta página.</p>}
      </div>
    </Shell>
  );
}
