import { type Staff, staffSchema, usersResponseSchema } from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { PhotoBlock } from '../../../components/photo/photo-block.tsx';
import { PrivacyBlock } from '../../../components/privacy/privacy-block.tsx';
import { Shell } from '../../../components/shell.tsx';
import { ROLE_LABELS } from '../../../lib/roles.ts';
import { canUsePrivacy } from '../../../lib/privacy.ts';
import { fetchApi, requireSession } from '../../../lib/session.ts';
import { canAccessStaff, canLinkStaffUser } from '../../../lib/staff.ts';
import { formatBirthDate, formatCpf, formatPhone, STATUS_LABELS } from '../../../lib/students.ts';
import { StaffLoadError } from '../staff-load-error.tsx';
import { StaffStatusActions } from './status-actions.tsx';
import { type LinkableUser, UserLink } from './user-link.tsx';
import { PAGE_BODY } from '../../../components/page-body.ts';

export const dynamic = 'force-dynamic';

const NONE = '—';
const byName = new Intl.Collator('pt-BR');

/** A ficha como a API a devolve, `notfound` ou `failed`. Cada leitura é auditada (door 5). */
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

/** Os usuários que o Administrador pode ligar à ficha, em ordem de nome, ou `failed`. */
async function loadUsers(): Promise<LinkableUser[] | 'failed'> {
  try {
    const response = await fetchApi('/api/users', await headers());
    if (response.status !== 200) return 'failed';
    const { users } = usersResponseSchema.parse(await response.json());
    return users
      .map(({ id, name, email }) => ({ id, name, email }))
      .sort((a, b) => byName.compare(a.name, b.name));
  } catch {
    return 'failed';
  }
}

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  // quem não acessa não chega a pedir a ficha; a API recusaria de qualquer forma
  const staff = canAccessStaff(session.user.role) ? await load(id) : 'forbidden';
  // só o Administrador liga o usuário, e só ele lista usuários
  const users = typeof staff === 'object' && canLinkStaffUser(session.user.role) ? await loadUsers() : undefined;

  return (
    <Shell session={session}>
      {staff === 'forbidden' ? (
        <p>Você não tem permissão para acessar esta página.</p>
      ) : staff === 'failed' ? (
        <StaffLoadError />
      ) : staff === 'notfound' ? (
        <p>Funcionário não encontrado.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-3xl font-medium">{staff.name}</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/staff/${staff.id}/edit`}>Editar</Link>
              </Button>
              <StaffStatusActions id={staff.id} name={staff.name} status={staff.status} />
            </div>
          </div>
          {staff.status === 'inactive' && staff.user?.active && (
            <Alert>Este funcionário está inativo e o usuário vinculado continua ativo.</Alert>
          )}
          <div className={PAGE_BODY}>
            <PhotoBlock
              url={`/api/staff/${staff.id}/photo`}
              conflict="Este funcionário já tem foto."
              name={staff.name}
              photoUrl={staff.photoUrl}
              canWrite
            />
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">Situação</dt>
                <dd>{STATUS_LABELS[staff.status]}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">CPF</dt>
                <dd>{formatCpf(staff.cpf)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Cargo</dt>
                <dd className="break-words">{staff.position}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Setor</dt>
                <dd className="break-words">{staff.department ?? NONE}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Data de admissão</dt>
                <dd>{formatBirthDate(staff.hiredAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Telefone</dt>
                <dd>{formatPhone(staff.phone)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">E-mail</dt>
                <dd className="break-words">{staff.email ?? NONE}</dd>
              </div>
            </dl>
          </div>
          <section aria-labelledby="access-title" className="grid gap-3">
            <h3 id="access-title" className="font-semibold">
              Acesso ao sistema
            </h3>
            {staff.user ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">E-mail do usuário</dt>
                  <dd className="break-words">{staff.user.email}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Perfil</dt>
                  <dd>{ROLE_LABELS[staff.user.role]}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Situação do usuário</dt>
                  <dd>{staff.user.active ? 'Ativo' : 'Inativo'}</dd>
                </div>
              </dl>
            ) : (
              <p>Sem usuário vinculado</p>
            )}
            {users === 'failed' && <Alert variant="destructive">Não foi possível carregar os usuários.</Alert>}
            {Array.isArray(users) && (
              <UserLink key={staff.user?.id ?? 'none'} staffId={staff.id} current={staff.user?.id ?? null} users={users} />
            )}
          </section>
          {canUsePrivacy(session.user.role) && <PrivacyBlock subject="staff" id={staff.id} name={staff.name} />}
        </>
      )}
    </Shell>
  );
}
