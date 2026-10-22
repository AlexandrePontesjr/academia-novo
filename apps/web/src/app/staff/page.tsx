import { type StaffListResponse, staffListResponseSchema } from '@academia/contracts';
import { Alert, Button, StaggerCell, Table, TableHead, TableRow } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { PersonPhoto } from '../../components/photo/person-photo.tsx';
import { Shell } from '../../components/shell.tsx';
import { ANONYMIZED_NOTICE } from '../../lib/privacy.ts';
import { fetchApi, requireSession } from '../../lib/session.ts';
import { canAccessStaff } from '../../lib/staff.ts';
import { STATUS_LABELS } from '../../lib/students.ts';
import { StaffLoadError } from './staff-load-error.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-medium">Funcionários</h2>
        {allowed && (
          <Button asChild>
            <Link href="/staff/new">Novo funcionário</Link>
          </Button>
        )}
      </div>
      <div className={PAGE_BODY}>
        {anonymized && <Alert>{ANONYMIZED_NOTICE}</Alert>}
        {!allowed ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : !list ? (
          <StaffLoadError />
        ) : list.items.length === 0 ? (
          <p>Nenhum funcionário cadastrado.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Situação</TableHead>
              </tr>
            </thead>
            <tbody>
              {list.items.map((member, index) => (
                <TableRow key={member.id}>
                  <StaggerCell index={index}>
                    <div className="flex items-center gap-3">
                      <PersonPhoto name={member.name} photoUrl={member.photoUrl} shape="thumb" />
                      {/* a ficha só conta como vista quando alguém a abre: nada de pré-carregar (door 5) */}
                      <Link
                        href={`/staff/${member.id}`}
                        prefetch={false}
                        className="text-primary underline underline-offset-4"
                      >
                        {member.name}
                      </Link>
                    </div>
                  </StaggerCell>
                  <StaggerCell index={index}>{member.position}</StaggerCell>
                  <StaggerCell index={index}>{member.department ?? '—'}</StaggerCell>
                  <StaggerCell index={index}>{STATUS_LABELS[member.status]}</StaggerCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Shell>
  );
}
