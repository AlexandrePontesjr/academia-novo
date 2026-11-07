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
import { EmptyState, ListOrTable, ScreenHeader, ShieldIcon } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Shell } from '../../components/shell.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';
import { TEXT_LINK } from '../../components/link-class.ts';
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
      <Link href={`/students/${item.entityId}`} prefetch={false} className={TEXT_LINK}>
        Ver aluno
      </Link>
    );
  }
  // idem para o funcionário: o link leva à ficha
  if (item.entity === 'staff') {
    return (
      <Link href={`/staff/${item.entityId}`} prefetch={false} className={TEXT_LINK}>
        Ver funcionário
      </Link>
    );
  }
  // o plano se abre na edição, que é onde ele é lido por inteiro
  if (item.entity === 'plan') {
    return (
      <Link href={`/plans/${item.entityId}/edit`} prefetch={false} className={TEXT_LINK}>
        Ver plano
      </Link>
    );
  }
  // o nome atual do alvo: a trilha não guarda nome
  const user = item.entity === 'user' ? users.find((candidate) => candidate.id === item.entityId) : undefined;
  return user?.name ?? item.entityId;
}

function AuditRows({ items, users, plans }: { items: AuditLog[]; users: User[]; plans: Plan[] }) {
  return (
    <ListOrTable
      head={['Data e hora', 'Usuário', 'Ação', 'Alvo', 'IP', 'Navegador', 'Detalhes']}
      rows={items.map((item) => {
        const details = diffDetails(item, users, plans);
        return {
          key: item.id,
          cells: [
            <span key="when" className="whitespace-nowrap">
              {formatInstant(item.createdAt)}
            </span>,
            item.user?.name ?? NONE,
            actionLabel(item.action),
            target(item, users),
            item.ip ?? NONE,
            <span key="agent" className="break-words">
              {item.userAgent ?? NONE}
            </span>,
            details.length > 0 ? (
              <ul key="details">
                {details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : (
              NONE
            ),
          ],
        };
      })}
    />
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
      <ScreenHeader title="Auditoria" />
      <div className={PAGE_BODY} data-slot="page-body">
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
              {...(loaded.kind === 'ok' ? { count: loaded.page.items.length } : {})}
            />
            {loaded.kind === 'ok' &&
              (loaded.page.items.length === 0 ? (
                <EmptyState icon={<ShieldIcon />} title="Nenhum registro encontrado." />
              ) : (
                <>
                  <AuditRows items={loaded.page.items} users={loaded.users} plans={loaded.plans} />
                  {nextPage && (
                    <div>
                      <Link href={nextPage} prefetch={false} className={`text-sm ${TEXT_LINK}`}>
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
