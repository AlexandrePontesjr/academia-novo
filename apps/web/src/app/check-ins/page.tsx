import { type CheckInsReport, checkInsReportSchema, problemSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { Shell } from '../../components/shell.tsx';
import { canCheckIn } from '../../lib/check-ins.ts';
import { fetchApi, requireSession } from '../../lib/session.ts';
import { CheckInsLoadError } from './check-ins-load-error.tsx';
import { type PeriodErrors, PeriodFilter } from './period-filter.tsx';
import { ReportTable } from './report-table.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

type Loaded = { kind: 'ok'; report: CheckInsReport } | { kind: 'invalid'; errors: PeriodErrors } | { kind: 'failed' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** O relatório do período da URL; sem "De" e "Até", a API escolhe hoje. */
async function load(from: string, to: string): Promise<Loaded> {
  try {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const response = await fetchApi(`/api/check-ins${query.size > 0 ? `?${query}` : ''}`, await headers());
    if (response.status === 422) {
      const errors: PeriodErrors = {};
      for (const { path, message } of problemSchema.parse(await response.json()).errors ?? []) {
        if (path === 'from' || path === 'to') errors[path] = message;
      }
      return Object.keys(errors).length > 0 ? { kind: 'invalid', errors } : { kind: 'failed' };
    }
    if (response.status !== 200) return { kind: 'failed' };
    return { kind: 'ok', report: checkInsReportSchema.parse(await response.json()) };
  } catch {
    return { kind: 'failed' };
  }
}

export default async function CheckInsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const params = await searchParams;
  const from = first(params.from);
  const to = first(params.to);
  // quem não lê o relatório não chega a pedi-lo; a API recusaria de qualquer forma
  const allowed = canCheckIn(session.user.role);
  const loaded = allowed ? await load(from, to) : undefined;

  return (
    <Shell session={session}>
      <h2 className="text-2xl font-bold">Presenças</h2>
      <div className={PAGE_BODY}>
        {!loaded ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : loaded.kind === 'failed' ? (
          <CheckInsLoadError />
        ) : loaded.kind === 'invalid' ? (
          <PeriodFilter from={from} to={to} errors={loaded.errors} />
        ) : (
          <>
            {/* os campos mostram o período que a API usou, com os padrões já aplicados */}
            <PeriodFilter from={loaded.report.from} to={loaded.report.to} errors={{}} />
            <p>Total no período: {loaded.report.total}</p>
            {loaded.report.items.length === 0 ? (
              <p>Nenhuma presença no período.</p>
            ) : (
              <ReportTable key={`${loaded.report.from}/${loaded.report.to}`} report={loaded.report} />
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
