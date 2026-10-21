import { type Staff, staffSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { Shell } from '../../../../components/shell.tsx';
import { fetchApi, requireSession } from '../../../../lib/session.ts';
import { canAccessStaff } from '../../../../lib/staff.ts';
import { StaffForm } from '../../staff-form.tsx';
import { StaffLoadError } from '../../staff-load-error.tsx';
import { PAGE_BODY } from '../../../../components/page-body.ts';

export const dynamic = 'force-dynamic';

/** O funcionário a editar, `notfound` ou `failed`. Abrir a edição é uma leitura auditada (Assumptions). */
async function load(id: string): Promise<Staff | 'notfound' | 'failed'> {
  try {
    const response = await fetchApi(`/api/staff/${encodeURIComponent(id)}`, await headers());
    if (response.status === 404) return 'notfound';
    if (response.status !== 200) return 'failed';
    return staffSchema.parse(await response.json());
  } catch {
    return 'failed';
  }
}

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  // quem não edita não chega a pedir a ficha; a API recusaria de qualquer forma
  const staff = canAccessStaff(session.user.role) ? await load(id) : 'forbidden';

  return (
    <Shell session={session}>
      <h2 className="text-3xl font-medium">Editar funcionário</h2>
      <div className={PAGE_BODY}>
        {staff === 'forbidden' ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : staff === 'failed' ? (
          <StaffLoadError />
        ) : staff === 'notfound' ? (
          <p>Funcionário não encontrado.</p>
        ) : (
          <StaffForm staff={staff} />
        )}
      </div>
    </Shell>
  );
}
