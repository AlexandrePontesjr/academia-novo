import { type MyProfile, myProfileSchema, type StudentPayment, studentPaymentsResponseSchema } from '@academia/contracts';
import { Table, TableCell, TableHead, TableRow } from '@academia/ui';
import { headers } from 'next/headers';
import { Brand } from '../../components/brand.tsx';
import { SignOutButton } from '../../components/sign-out-button.tsx';
import { formatPeriod, PAYMENT_STATUS_LABELS } from '../../lib/payments.ts';
import { fetchApi, requireSession } from '../../lib/session.ts';
import { formatBirthDate } from '../../lib/students.ts';
import { ContactForm } from './contact-form.tsx';
import { MyAccountLoadError } from './load-error.tsx';
import { MyPhoto } from './my-photo.tsx';

export const dynamic = 'force-dynamic';

const SECTION = 'grid min-w-0 gap-4 rounded-2xl border bg-card p-5';

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

/** A área do aluno (door 6): o perfil, a foto, os dados de contato e os períodos, numa coluna só. */
export default async function MyAccountPage() {
  await requireSession();
  const data = await load();

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-16 pb-10 lg:py-10">
      <div className="flex items-center justify-between gap-4">
        <Brand />
        <SignOutButton />
      </div>
      {data === 'failed' ? (
        <>
          <h1 className="text-4xl font-medium">Minha conta</h1>
          <MyAccountLoadError />
        </>
      ) : (
        <>
          <div className="grid gap-1">
            <h1 className="text-4xl font-medium">Minha conta</h1>
            <p className="text-sm text-muted-foreground">{data.profile.name}</p>
          </div>
          <section aria-labelledby="photo-heading" className={SECTION}>
            <h2 id="photo-heading" className="text-lg font-semibold">
              Foto
            </h2>
            <MyPhoto name={data.profile.name} photoUrl={data.profile.photoUrl} pending={data.profile.pendingPhoto} />
          </section>
          <section aria-labelledby="contact-heading" className={SECTION}>
            <h2 id="contact-heading" className="text-lg font-semibold">
              Meus dados
            </h2>
            <ContactForm profile={data.profile} />
          </section>
          <section aria-labelledby="payments-heading" className={SECTION}>
            <h2 id="payments-heading" className="text-lg font-semibold">
              Pagamentos
            </h2>
            {data.periods.length === 0 ? <p>Você ainda não tem matrícula registrada.</p> : <Periods items={data.periods} />}
          </section>
        </>
      )}
    </main>
  );
}

/** Os períodos do aluno, do vencimento mais novo para o mais antigo (AC 35). */
function Periods({ items }: { items: StudentPayment[] }) {
  const newestFirst = items.toSorted((a, b) => b.dueDate.localeCompare(a.dueDate));
  return (
    <Table>
      <thead>
        <tr>
          <TableHead>Plano</TableHead>
          <TableHead>Período</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Situação</TableHead>
        </tr>
      </thead>
      <tbody>
        {newestFirst.map((item) => (
          <TableRow key={item.enrollmentId}>
            <TableCell>{item.plan.name}</TableCell>
            <TableCell>{formatPeriod(item.startsAt, item.endsAt)}</TableCell>
            <TableCell>{formatBirthDate(item.dueDate)}</TableCell>
            <TableCell>{PAYMENT_STATUS_LABELS[item.status]}</TableCell>
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}
