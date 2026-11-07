import { type MyProfile, myProfileSchema, type StudentPayment, studentPaymentsResponseSchema } from '@academia/contracts';
import { CalendarIcon, EmptyState, ListOrTable, Reveal, ScreenHeader, StatusBadge } from '@academia/ui';
import { headers } from 'next/headers';
import { Brand } from '../../components/brand.tsx';
import { SignOutButton } from '../../components/sign-out-button.tsx';
import { formatDay } from '../../lib/consents.ts';
import { formatPeriod, PAYMENT_STATUS_LABELS } from '../../lib/payments.ts';
import { formatPrice } from '../../lib/plans.ts';
import { fetchApi, requireSession } from '../../lib/session.ts';
import { formatBirthDate } from '../../lib/students.ts';
import { ContactForm } from './contact-form.tsx';
import { MyAccountLoadError } from './load-error.tsx';
import { MyPhoto } from './my-photo.tsx';

export const dynamic = 'force-dynamic';

/** A superfície de um cartão do portal: o cartão do tema, na largura da coluna do `main`. */
const CARD = 'grid min-w-0 gap-4 rounded-2xl border bg-card p-5';

/** O perfil e os períodos do aluno da sessão, ou `failed`: a tela só mostra os dois juntos. */
async function load(): Promise<{ profile: MyProfile; periods: StudentPayment[] } | 'failed'> {
  try {
    const incoming = await headers();
    const [profile, payments] = await Promise.all([fetchApi('/api/me/profile', incoming), fetchApi('/api/me/payments', incoming)]);
    if (profile.status !== 200 || payments.status !== 200) return 'failed';
    return {
      profile: myProfileSchema.parse(await profile.json()),
      periods: studentPaymentsResponseSchema.parse(await payments.json()).items,
    };
  } catch {
    return 'failed';
  }
}

/**
 * O período "atual" do resumo: o primeiro por pagar, do vencimento mais antigo para o mais novo -
 * é o que o aluno precisa resolver agora; com todos pagos, o de vencimento mais recente.
 */
function currentPeriodOf(items: StudentPayment[]): StudentPayment | undefined {
  const open = items
    .filter((item) => item.status === 'pending' || item.status === 'overdue')
    .toSorted((one, other) => one.dueDate.localeCompare(other.dueDate));
  return open[0] ?? items.toSorted((one, other) => other.dueDate.localeCompare(one.dueDate))[0];
}

/** A área do aluno (AD-124): o cabeçalho, o bloco de identidade, o resumo e o histórico de pagamentos. */
export default async function MyAccountPage() {
  await requireSession();
  const data = await load();
  const current = data === 'failed' ? undefined : currentPeriodOf(data.periods);

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-16 pb-10 lg:px-8 lg:py-10">
      <div className="flex items-center justify-between gap-4">
        <Brand />
        <SignOutButton />
      </div>
      {data === 'failed' ? (
        <>
          <section aria-label="Identidade" data-slot="identity">
            <ScreenHeader title="Minha conta" />
          </section>
          <MyAccountLoadError />
        </>
      ) : (
        <>
          <section aria-label="Identidade" data-slot="identity" className="grid gap-4">
            <ScreenHeader
              eyebrow="Minha conta"
              title={data.profile.name}
              meta={current?.plan.name}
              actions={
                current && (
                  <StatusBadge variant="payment" status={current.status}>
                    {PAYMENT_STATUS_LABELS[current.status]}
                  </StatusBadge>
                )
              }
            />
            <div className="grid min-w-0 gap-3" data-slot="photo">
              <h2 className="text-lg font-semibold">Foto</h2>
              <MyPhoto name={data.profile.name} photoUrl={data.profile.photoUrl} pending={data.profile.pendingPhoto} />
            </div>
          </section>
          {current && <Summary current={current} />}
          <Reveal as="section" index={current ? 1 : 0} data-slot="dados" aria-label="Meus dados" className={CARD}>
            <h2 className="text-lg font-semibold">Meus dados</h2>
            <ContactForm profile={data.profile} />
          </Reveal>
          <Reveal as="section" index={current ? 2 : 1} data-slot="pagamentos" aria-label="Pagamentos" className={CARD}>
            <h2 className="text-lg font-semibold">Pagamentos</h2>
            {data.periods.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon />}
                title="Você ainda não tem matrícula registrada."
                description="Fale com a recepção para fazer sua matrícula."
              />
            ) : (
              <div id="historico" className="grid min-w-0 gap-4">
                <History items={data.periods} />
              </div>
            )}
          </Reveal>
        </>
      )}
    </main>
  );
}

/** O cartão de resumo: o próximo vencimento, o plano, a situação e o atalho para o histórico (AC 36). */
function Summary({ current }: { current: StudentPayment }) {
  const overdue = current.status === 'overdue';
  return (
    <Reveal as="section" index={0} data-slot="summary" aria-label="Resumo" className={CARD}>
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Próximo vencimento</p>
        <p className={`text-2xl font-medium tabular-nums${overdue ? ' text-status-bad' : ''}`} data-slot="summary-due">
          {formatBirthDate(current.dueDate)}
        </p>
        <p className="text-sm">{current.plan.name}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge variant="payment" status={current.status}>
          {PAYMENT_STATUS_LABELS[current.status]}
        </StatusBadge>
        <a href="#historico" className="text-primary underline underline-offset-4">
          Ver pagamentos
        </a>
      </div>
    </Reveal>
  );
}

/** Os períodos do aluno, do vencimento mais novo para o mais antigo (AC 35, AC 39). */
function History({ items }: { items: StudentPayment[] }) {
  const newestFirst = items.toSorted((one, other) => other.dueDate.localeCompare(one.dueDate));
  const rows = newestFirst.map((item) => ({
    key: item.enrollmentId,
    cells: [
      item.plan.name,
      formatPeriod(item.startsAt, item.endsAt),
      formatBirthDate(item.dueDate),
      formatPrice(item.priceCents),
      <span key="situacao" className="grid justify-items-start gap-1">
        <StatusBadge variant="payment" status={item.status}>
          {PAYMENT_STATUS_LABELS[item.status]}
        </StatusBadge>
        {item.payment && (
          <span className="text-xs text-muted-foreground" data-slot="payment-date">
            {formatDay(item.payment.createdAt)}
          </span>
        )}
      </span>,
    ],
  }));
  return <ListOrTable head={['Plano', 'Período', 'Vencimento', 'Valor', 'Situação']} rows={rows} numeric={[3]} />;
}
