import type { DashboardResponse } from '@academia/contracts';
import { Table, TableCell, TableHead, TableRow } from '@academia/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Shell } from '../components/shell.tsx';
import { loadDashboard } from '../lib/dashboard-server.ts';
import { PERIOD_LABELS } from '../lib/plans.ts';
import { requireSession } from '../lib/session.ts';
import { formatBirthDate } from '../lib/students.ts';
import { DashboardLoadError } from './dashboard-load-error.tsx';

// A sessão é conferida a cada requisição, nunca no build.
export const dynamic = 'force-dynamic';

const LINK = 'text-primary underline underline-offset-4';

/** Um card do painel: uma região com o título dele por nome. */
function Card({ id, title, wide, children }: { id: string; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`grid content-start gap-3 rounded-lg border p-4${wide ? ' sm:col-span-2' : ''}`}>
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** As contagens de um card, cada número sob o rótulo dele; com `href`, o número é o link. */
function Counts({ items }: { items: Array<{ label: string; value: number; href?: string }> }) {
  return (
    <dl className="flex flex-wrap gap-8">
      {items.map(({ label, value, href }) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="text-2xl font-semibold">
            {href ? (
              <Link href={href} prefetch={false} className={LINK}>
                {value}
              </Link>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Plan = NonNullable<DashboardResponse['enrollments']>['byPlan'][number]['plan'];
const planLabel = (plan: Plan) => `${plan.name} · ${PERIOD_LABELS[plan.period]}`;

/** Os cards seguem as chaves da resposta, não o perfil da sessão: quem corta é a API (door 1). */
function Cards({ dashboard }: { dashboard: DashboardResponse }) {
  const { students, enrollments, payments, checkIns } = dashboard;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card id="card-students" title="Alunos">
        <Counts
          items={[
            { label: 'Ativos', value: students.active },
            { label: 'Inativos', value: students.inactive },
            { label: 'Suspensos', value: students.suspended },
          ]}
        />
        <Link href="/students" prefetch={false} className={`${LINK} text-sm`}>
          Ver alunos
        </Link>
      </Card>
      {checkIns && (
        <Card id="card-check-ins" title="Check-ins de hoje">
          <p className="text-2xl font-semibold">{checkIns.count}</p>
          <Link href="/check-ins" prefetch={false} className={`${LINK} text-sm`}>
            Ver presenças de hoje
          </Link>
        </Card>
      )}
      {enrollments && (
        <Card id="card-enrollments" title="Matrículas">
          <Counts
            items={[
              { label: 'Ativas', value: enrollments.active },
              { label: 'Agendadas', value: enrollments.scheduled },
            ]}
          />
        </Card>
      )}
      {enrollments && (
        <Card id="card-expiring" title={`Vencimentos nos próximos ${enrollments.expiringSoon.days} dias`} wide>
          {enrollments.expiringSoon.items.length === 0 ? (
            <p>Nenhum vencimento nos próximos {enrollments.expiringSoon.days} dias.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Vence em</TableHead>
                </tr>
              </thead>
              <tbody>
                {enrollments.expiringSoon.items.map((item) => (
                  <TableRow key={item.enrollmentId}>
                    <TableCell>
                      <Link href={`/students/${item.student.id}`} prefetch={false} className={LINK}>
                        {item.student.name}
                      </Link>
                    </TableCell>
                    <TableCell>{planLabel(item.plan)}</TableCell>
                    <TableCell>{formatBirthDate(item.endsAt)}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
      {payments && (
        <Card id="card-payments" title="Pagamentos">
          <Counts
            items={[
              { label: 'Pendentes', value: payments.pending, href: '/payments?status=pending' },
              { label: 'Atrasados', value: payments.overdue, href: '/payments?status=overdue' },
            ]}
          />
        </Card>
      )}
      {enrollments && (
        <Card id="card-by-plan" title="Matrículas ativas por plano">
          {enrollments.byPlan.length === 0 ? (
            <p>Nenhuma matrícula ativa.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Plano</TableHead>
                  <TableHead>Matrículas ativas</TableHead>
                </tr>
              </thead>
              <tbody>
                {enrollments.byPlan.map(({ plan, active }) => (
                  <TableRow key={plan.id}>
                    <TableCell>{planLabel(plan)}</TableCell>
                    <TableCell>{active}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

export default async function HomePage() {
  const session = await requireSession();
  const dashboard = await loadDashboard();

  return (
    <Shell session={session}>
      <p>Olá, {session.user.name}.</p>
      <div>
        <h2 className="text-lg font-semibold">Painel</h2>
        {dashboard && <p className="text-sm text-muted-foreground">Situação em {formatBirthDate(dashboard.today)}</p>}
      </div>
      {dashboard ? <Cards dashboard={dashboard} /> : <DashboardLoadError />}
    </Shell>
  );
}
