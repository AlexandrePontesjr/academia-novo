import { type User, usersResponseSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { Shell } from '../../components/shell.tsx';
import { fetchApi, requireSession } from '../../lib/session.ts';
import { UsersLoadError } from './users-load-error.tsx';
import { UsersPanel } from './users-panel.tsx';

export const dynamic = 'force-dynamic';

const byName = new Intl.Collator('pt-BR');

/** A lista em ordem alfabética de nome, `forbidden` quando a API recusa o perfil, ou `failed` quando ela não carrega. */
async function loadUsers(): Promise<User[] | 'forbidden' | 'failed'> {
  try {
    const response = await fetchApi('/api/users', await headers());
    if (response.status === 403) return 'forbidden';
    if (response.status !== 200) return 'failed';
    const { users } = usersResponseSchema.parse(await response.json());
    return users.sort((a, b) => byName.compare(a.name, b.name));
  } catch {
    return 'failed';
  }
}

export default async function UsersPage() {
  const session = await requireSession();
  // quem não é Administrador não chega a pedir a lista; a API recusaria de qualquer forma
  const users = session.user.role === 'admin' ? await loadUsers() : 'forbidden';

  return (
    <Shell session={session}>
      <h2 className="text-lg font-semibold">Usuários</h2>
      {users === 'forbidden' ? (
        <p>Você não tem permissão para acessar esta página.</p>
      ) : users === 'failed' ? (
        <UsersLoadError />
      ) : (
        <UsersPanel users={users} />
      )}
    </Shell>
  );
}
