import type { DashboardResponse } from '@academia/contracts';
import { ArrowUpRightIcon, Gauge, MetricTile, Panel, PANEL_ARROW, StatPill, Table, TableCell, TableHead, TableRow, WeekBars } from '@academia/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Shell } from '../../components/shell.tsx';
import { loadDashboard } from '../../lib/dashboard-server.ts';
import { PERIOD_LABELS } from '../../lib/plans.ts';
import { requireSession } from '../../lib/session.ts';
import { formatBirthDate } from '../../lib/students.ts';
import { DashboardLoadError } from './dashboard-load-error.tsx';

// A sessão é conferida a cada requisição, nunca no build.
export const dynamic = 'force-dynamic';

const LINK = 'text-primary underline underline-offset-4';

/** O botão ↗ do canto do cartão, com o nome do link de texto que ele substitui (AC 13). */
function Arrow({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} prefetch={false} aria-label={label} className={PANEL_ARROW}>
      <ArrowUpRightIcon className="size-4" />
    </Link>
  );
}

type Plan = NonNullable<DashboardResponse['enrollments']>['byPlan'][number]['plan'];
const planLabel = (plan: Plan) => `${plan.name} · ${PERIOD_LABELS[plan.period]}`;

/** Uma lista do painel: linhas empilhadas no celular, a `Table` existente a partir de 768 px (AC 19). */
function ListOrTable({ head, rows }: { head: string[]; rows: Array<{ key: string; cells: ReactNode[] }> }) {
  return (
    <>
      <ul className="grid gap-2 md:hidden" data-slot="panel-rows">
        {rows.map(({ key, cells }) => (
          <li key={key} className="grid gap-1 rounded-2xl bg-[#1a1a1a] p-3 text-sm">
            {cells.map((cell, index) => (
              <span key={head[index]} className={index === 0 ? 'font-semibold' : 'text-muted-foreground'}>
                {cell}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              {head.map((title) => (
                <TableHead key={title}>{title}</TableHead>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, cells }) => (
              <TableRow key={key}>
                {cells.map((cell, index) => (
                  <TableCell key={head[index]}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

/** Os cards seguem as chaves da resposta, não o perfil da sessão: quem corta é a API (door 1). */
function Cards({ dashboard }: { dashboard: DashboardResponse }) {
  const { students, enrollments, payments, checkIns, today } = dashboard;
  const weekMax = checkIns ? Math.max(0, ...checkIns.lastSevenDays.map((day) => day.count)) : 0;
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-slot="dashboard-grid">
      <Panel id="card-students" title="Alunos" action={<Arrow href="/students" label="Ver alunos" />}>
        <dl className="grid gap-4">
          <div className="grid gap-1">
            <dt className="text-sm text-muted-foreground">Ativos</dt>
            <dd className="text-5xl font-semibold tabular-nums">{students.active}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatPill label="Inativos" value={students.inactive} />
            <StatPill label="Suspensos" value={students.suspended} />
          </div>
        </dl>
      </Panel>
      {checkIns && (
        <Panel id="card-check-ins" title="Check-ins de hoje" action={<Arrow href="/check-ins" label="Ver presenças de hoje" />}>
          <Gauge
            value={checkIns.count}
            max={weekMax}
            label={`${checkIns.count} check-ins hoje`}
            pill={formatBirthDate(today)}
          />
        </Panel>
      )}
      {checkIns && (
        <Panel id="card-week" title="Check-ins da semana">
          <WeekBars days={checkIns.lastSevenDays} label="Check-ins por dia, últimos 7 dias" />
        </Panel>
      )}
      {enrollments && (
        <Panel id="card-enrollments" title="Matrículas">
          <dl className="grid grid-cols-2 gap-3">
            <MetricTile label="Ativas" value={enrollments.active} />
            <MetricTile label="Agendadas" value={enrollments.scheduled} />
          </dl>
        </Panel>
      )}
      {enrollments && (
        <Panel
          id="card-expiring"
          title={`Vencimentos nos próximos ${enrollments.expiringSoon.days} dias`}
          className="md:col-span-2"
        >
          {enrollments.expiringSoon.items.length === 0 ? (
            <p>Nenhum vencimento nos próximos {enrollments.expiringSoon.days} dias.</p>
          ) : (
            <ListOrTable
              head={['Aluno', 'Plano', 'Vence em']}
              rows={enrollments.expiringSoon.items.map((item) => ({
                key: item.enrollmentId,
                cells: [
                  <Link key="student" href={`/students/${item.student.id}`} prefetch={false} className={LINK}>
                    {item.student.name}
                  </Link>,
                  planLabel(item.plan),
                  formatBirthDate(item.endsAt),
                ],
              }))}
            />
          )}
        </Panel>
      )}
      {payments && (
        <Panel id="card-payments" title="Pagamentos">
          <dl className="grid grid-cols-2 gap-3">
            <MetricTile
              label="Pendentes"
              value={
                <Link href="/payments?status=pending" prefetch={false} className={LINK}>
                  {payments.pending}
                </Link>
              }
            />
            <MetricTile
              label="Atrasados"
              value={
                <Link href="/payments?status=overdue" prefetch={false} className={LINK}>
                  {payments.overdue}
                </Link>
              }
            />
          </dl>
        </Panel>
      )}
      {enrollments && (
        <Panel id="card-by-plan" title="Matrículas ativas por plano">
          {enrollments.byPlan.length === 0 ? (
            <p>Nenhuma matrícula ativa.</p>
          ) : (
            <ListOrTable
              head={['Plano', 'Matrículas ativas']}
              rows={enrollments.byPlan.map(({ plan, active }) => ({ key: plan.id, cells: [planLabel(plan), active] }))}
            />
          )}
        </Panel>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  const dashboard = await loadDashboard();
  const overdue = dashboard?.payments?.overdue ?? 0;

  return (
    <Shell session={session} {...(overdue > 0 ? { alert: 'Há pagamentos atrasados' } : {})}>
      <p>Olá, {session.user.name}.</p>
      <div>
        <h2 className="text-2xl font-bold">Painel</h2>
        {dashboard && <p className="text-sm text-muted-foreground">Situação em {formatBirthDate(dashboard.today)}</p>}
      </div>
      {dashboard ? <Cards dashboard={dashboard} /> : <DashboardLoadError />}
    </Shell>
  );
}
