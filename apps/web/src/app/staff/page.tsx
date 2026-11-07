import { type StaffListResponse, staffListResponseSchema } from '@academia/contracts';
import { Alert, Button, EmptyState, ListOrTable, ScreenHeader, StatusBadge, UsersIcon } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { PersonPhoto } from '../../components/photo/person-photo.tsx';
import { Shell } from '../../components/shell.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';
import { TEXT_LINK } from '../../components/link-class.ts';
import { ANONYMIZED_NOTICE } from '../../lib/privacy.ts';
import { fetchApi, requireSession } from '../../lib/session.ts';
import { canAccessStaff } from '../../lib/staff.ts';
import { STATUS_LABELS } from '../../lib/students.ts';
import { StaffLoadError } from './staff-load-error.tsx';

export const dynamic = 'force-dynamic';

/** A lista como a API a devolve, ou `undefined` quando ela não a entrega. Cada leitura é auditada (door 5). */
async function load(): Promise<StaffListResponse | undefined> {
  try {
    const response = await fetchApi('/api/staff', await headers());
    if (response.status !== 200) return undefined;
    return staffListResponseSchema.parse(await response.json());
  } catch {
    return undefined;
  }
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ anonymized?: string | string[] }> }) {
  const session = await requireSession();
  // a ficha anonimizada leva de volta à lista com o aviso (privacidade)
  const anonymized = (await searchParams).anonymized === '1';
  // quem não acessa não chega a pedir a lista; a API recusaria de qualquer forma
  const allowed = canAccessStaff(session.user.role);
  const list = allowed ? await load() : undefined;

  return (
    <Shell session={session}>
      <ScreenHeader
        title="Funcionários"
        actions={
          allowed ? (
            <Button asChild>
              <Link href="/staff/new">Novo funcionário</Link>
            </Button>
          ) : undefined
        }
      />
      <div className={PAGE_BODY} data-slot="page-body">
        {anonymized && <Alert>{ANONYMIZED_NOTICE}</Alert>}
        {!allowed ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : !list ? (
          <StaffLoadError />
        ) : list.items.length === 0 ? (
          <EmptyState icon={<UsersIcon />} title="Nenhum funcionário cadastrado." />
        ) : (
          <ListOrTable
            head={['Nome', 'Cargo', 'Setor', 'Situação']}
            rows={list.items.map((member) => ({
              key: member.id,
              cells: [
                <div key="name" className="flex items-center gap-3">
                  <PersonPhoto name={member.name} photoUrl={member.photoUrl} shape="thumb" />
                  {/* a ficha só conta como vista quando alguém a abre: nada de pré-carregar (door 5) */}
                  <Link href={`/staff/${member.id}`} prefetch={false} className={TEXT_LINK}>
                    {member.name}
                  </Link>
                </div>,
                member.position,
                member.department ?? '—',
                <StatusBadge key="status" variant="staff" status={member.status}>
                  {STATUS_LABELS[member.status]}
                </StatusBadge>,
              ],
            }))}
          />
        )}
      </div>
    </Shell>
  );
}
