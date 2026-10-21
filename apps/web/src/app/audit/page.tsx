import {
  type AuditLog,
  type AuditLogsResponse,
  auditLogsResponseSchema,
  type Plan,
  plansResponseSchema,
  problemSchema,
  type User,
  usersResponseSchema,
} from '@academia/contracts';
import { Table, TableCell, TableHead, TableRow } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Shell } from '../../components/shell.tsx';
import {
  actionLabel,
  AUDIT_FILTERS,
  type AuditFilterValues,
  dayStart,
  diffDetails,
  formatInstant,
} from '../../lib/audit.ts';
import { fetchApi, requireSession } from '../../lib/session.ts';
import { AuditFilters } from './audit-filters.tsx';
import { AuditLoadError } from './audit-load-error.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';

export const dynamic = 'force-dynamic';

const NONE = '—';
const byName = new Intl.Collator('pt-BR');

type SearchParams = Record<string, string | string[] | undefined>;
type FilterErrors = Partial<Record<keyof AuditFilterValues, string>>;

type Loaded =
  | { kind: 'ok'; page: AuditLogsResponse; users: User[]; plans: Plan[] }
  | { kind: 'invalid'; errors: FilterErrors; users: User[] }
  | { kind: 'forbidden' }
  | { kind: 'failed' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** A query da API para os filtros da URL: "De" é o início daquele dia e "Até" o fim dele, no fuso da tela. */
function apiQuery(filters: AuditFilterValues, cursor: string): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.from) query.set('from', dayStart(filters.from));
  // `to` é exclusivo na API: o fim do dia é o início do dia seguinte
  if (filters.to) query.set('to', dayStart(filters.to, 1));
  if (filters.userId) query.set('userId', filters.userId);
  if (filters.action) query.set('action', filters.action);
  if (filters.ip) query.set('ip', filters.ip);
  if (cursor) query.set('cursor', cursor);
  return query;
}

/**
 * A página da trilha, os usuários (os nomes do "Alvo" e do filtro) e os planos (o nome do plano de uma
 * matrícula), ou por que não vieram. Sem os planos a trilha segue legível: o plano aparece pelo id.
 */
async function load(filters: AuditFilterValues, cursor: string): Promise<Loaded> {
  try {
    const incoming = await headers();
    const query = apiQuery(filters, cursor);
    const [logs, listed, plansListed] = await Promise.all([
      fetchApi(`/api/audit-logs${query.size > 0 ? `?${query}` : ''}`, incoming),
      fetchApi('/api/users', incoming),
      fetchApi('/api/plans', incoming).catch(() => undefined),
    ]);
    if (logs.status === 403 || listed.status === 403) return { kind: 'forbidden' };
    if (listed.status !== 200) return { kind: 'failed' };
    const { users } = usersResponseSchema.parse(await listed.json());
    users.sort((a, b) => byName.compare(a.name, b.name));

    if (logs.status === 422) {
      const errors: FilterErrors = {};
      for (const { path, message } of problemSchema.parse(await logs.json()).errors ?? []) {
        if ((AUDIT_FILTERS as readonly string[]).includes(path)) errors[path as keyof AuditFilterValues] = message;
      }
      // um `422` que não aponta filtro nenhum (o cursor, por exemplo) não tem onde aparecer
      return Object.keys(errors).length > 0 ? { kind: 'invalid', errors, users } : { kind: 'failed' };
    }
    if (logs.status !== 200) return { kind: 'failed' };
    const plans =
      plansListed?.status === 200 ? plansResponseSchema.safeParse(await plansListed.json()).data?.items : undefined;
    return { kind: 'ok', page: auditLogsResponseSchema.parse(await logs.json()), users, plans: plans ?? [] };
  } catch {
    return { kind: 'failed' };
  }
}

function target(item: AuditLog, users: User[]): ReactNode {
  if (!item.entityId) return NONE;
  // a trilha não guarda o nome do aluno: o link leva à ficha
  if (item.entity === 'student') {
    return (
      <Link href={`/students/${item.entityId}`} prefetch={false} className="text-primary underline underline-offset-4">
        Ver aluno
      </Link>
    );
  }
  // idem para o funcionário: o link leva à ficha
  if (item.entity === 'staff') {
    return (
      <Link href={`/staff/${item.entityId}`} prefetch={false} className="text-primary underline underline-offset-4">
        Ver funcionário
      </Link>
    );
  }
  // o plano se abre na edição, que é onde ele é lido por inteiro
  if (item.entity === 'plan') {
    return (
      <Link href={`/plans/${item.entityId}/edit`} prefetch={false} className="text-primary underline underline-offset-4">
        Ver plano
      </Link>
    );
  }
  // o nome atual do alvo: a trilha não guarda nome
  const user = item.entity === 'user' ? users.find((candidate) => candidate.id === item.entityId) : undefined;
  return user?.name ?? item.entityId;
}

function AuditTable({ items, users, plans }: { items: AuditLog[]; users: User[]; plans: Plan[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <TableHead>Data e hora</TableHead>
          <TableHead>Usuário</TableHead>
          <TableHead>Ação</TableHead>
          <TableHead>Alvo</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>Navegador</TableHead>
          <TableHead>Detalhes</TableHead>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const details = diffDetails(item, users, plans);
          return (
            <TableRow key={item.id}>
              <TableCell className="whitespace-nowrap">{formatInstant(item.createdAt)}</TableCell>
              <TableCell>{item.user?.name ?? NONE}</TableCell>
              <TableCell>{actionLabel(item.action)}</TableCell>
              <TableCell>{target(item, users)}</TableCell>
              <TableCell>{item.ip ?? NONE}</TableCell>
              <TableCell className="max-w-xs break-words">{item.userAgent ?? NONE}</TableCell>
              <TableCell>
                {details.length > 0 ? (
                  <ul>
                    {details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                ) : (
                  NONE
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </tbody>
    </Table>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const params = await searchParams;
  const filters: AuditFilterValues = {
    from: first(params.from),
    to: first(params.to),
    userId: first(params.userId),
    action: first(params.action),
    ip: first(params.ip),
  };
  // quem não é Administrador não chega a pedir a trilha; a API recusaria de qualquer forma
  const loaded: Loaded =
    session.user.role === 'admin' ? await load(filters, first(params.cursor)) : { kind: 'forbidden' };

  let nextPage: string | undefined;
  if (loaded.kind === 'ok' && loaded.page.nextCursor) {
    const query = new URLSearchParams();
    for (const name of AUDIT_FILTERS) if (filters[name]) query.set(name, filters[name]);
    query.set('cursor', loaded.page.nextCursor);
    nextPage = `/audit?${query}`;
  }

  return (
    <Shell session={session}>
      <h2 className="text-3xl font-medium">Auditoria</h2>
      <div className={PAGE_BODY}>
        {loaded.kind === 'forbidden' ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : loaded.kind === 'failed' ? (
          <AuditLoadError />
        ) : (
          <>
            <AuditFilters
              values={filters}
              users={loaded.users.map(({ id, name }) => ({ id, name }))}
              errors={loaded.kind === 'invalid' ? loaded.errors : {}}
            />
            {loaded.kind === 'ok' &&
              (loaded.page.items.length === 0 ? (
                <p>Nenhum registro encontrado.</p>
              ) : (
                <>
                  <AuditTable items={loaded.page.items} users={loaded.users} plans={loaded.plans} />
                  {nextPage && (
                    <div>
                      <Link href={nextPage} prefetch={false} className="text-sm text-primary underline underline-offset-4">
                        Próxima página
                      </Link>
                    </div>
                  )}
                </>
              ))}
          </>
        )}
      </div>
    </Shell>
  );
}
