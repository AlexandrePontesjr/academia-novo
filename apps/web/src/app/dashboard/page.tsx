import type { DashboardResponse } from '@academia/contracts';
import {
  ArrowUpRightIcon,
  Gauge,
  ListOrTable,
  MetricTile,
  Panel,
  PANEL_ARROW,
  ScreenHeader,
  StatPill,
  WeekBars,
} from '@academia/ui';
import Link from 'next/link';
import { Shell } from '../../components/shell.tsx';
import { TEXT_LINK } from '../../components/link-class.ts';
import { loadDashboard } from '../../lib/dashboard-server.ts';
import { PERIOD_LABELS } from '../../lib/plans.ts';
import { requireSession } from '../../lib/session.ts';
import { formatBirthDate } from '../../lib/students.ts';
import { DashboardLoadError } from './dashboard-load-error.tsx';

// A sessão é conferida a cada requisição, nunca no build.
export const dynamic = 'force-dynamic';

const LINK = TEXT_LINK;

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

/** Os cards seguem as chaves da resposta, não o perfil da sessão: quem corta é a API (door 1). */
function Cards({ dashboard }: { dashboard: DashboardResponse }) {
  const { students, enrollments, payments, checkIns, today } = dashboard;
  const weekMax = checkIns ? Math.max(0, ...checkIns.lastSevenDays.map((day) => day.count)) : 0;
  // a posição de cada cartão presente, na ordem da grade: a cascata conta só os que aparecem
  let card = 0;
  const next = () => card++;
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-slot="dashboard-grid">
      <Panel index={next()} id="card-students" title="Alunos" action={<Arrow href="/students" label="Ver alunos" />}>
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
        <Panel index={next()} id="card-check-ins" title="Check-ins de hoje" action={<Arrow href="/check-ins" label="Ver presenças de hoje" />}>
          <Gauge
            value={checkIns.count}
            max={weekMax}
            label={`${checkIns.count} check-ins hoje`}
            pill={formatBirthDate(today)}
          />
        </Panel>
      )}
      {checkIns && (
        <Panel index={next()} id="card-week" title="Check-ins da semana">
          <WeekBars days={checkIns.lastSevenDays} label="Check-ins por dia, últimos 7 dias" />
        </Panel>
      )}
      {enrollments && (
        <Panel index={next()} id="card-enrollments" title="Matrículas">
          <dl className="grid grid-cols-2 gap-3">
            <MetricTile label="Ativas" value={enrollments.active} />
            <MetricTile label="Agendadas" value={enrollments.scheduled} />
          </dl>
        </Panel>
      )}
      {enrollments && (
        <Panel
          index={next()}
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
        <Panel index={next()} id="card-payments" title="Pagamentos">
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
        <Panel index={next()} id="card-by-plan" title="Matrículas ativas por plano">
          {enrollments.byPlan.length === 0 ? (
            <p>Nenhuma matrícula ativa.</p>
          ) : (
            <ListOrTable
              head={['Plano', 'Matrículas ativas']}
              numeric={[1]}
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
      <ScreenHeader
        eyebrow={`Olá, ${session.user.name}.`}
        title="Painel"
        meta={dashboard ? `Situação em ${formatBirthDate(dashboard.today)}` : undefined}
      />
      {dashboard ? <Cards dashboard={dashboard} /> : <DashboardLoadError />}
    </Shell>
  );
}
