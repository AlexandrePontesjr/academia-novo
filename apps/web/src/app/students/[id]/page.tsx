import {
  type Enrollment,
  enrollmentsResponseSchema,
  isMinor,
  saoPauloToday,
  type StudentCheckInsResponse,
  studentCheckInsResponseSchema,
  type StudentConsentsResponse,
  type StudentPayment,
  studentConsentsResponseSchema,
  studentPaymentsResponseSchema,
} from '@academia/contracts';
import { Button, PANEL, ScreenHeader, StatusBadge } from '@academia/ui';
import { headers } from 'next/headers';
import type { z } from 'zod';
import Link from 'next/link';
import { PhotoBlock } from '../../../components/photo/photo-block.tsx';
import { PrivacyBlock } from '../../../components/privacy/privacy-block.tsx';
import { Shell } from '../../../components/shell.tsx';
import { PAGE_BODY } from '../../../components/page-body.ts';
import { canCheckIn } from '../../../lib/check-ins.ts';
import { loadPlans } from '../../../lib/plans-server.ts';
import { canReadPayments } from '../../../lib/payments.ts';
import { canReadPlans, canWritePlans } from '../../../lib/plans.ts';
import { canUsePrivacy } from '../../../lib/privacy.ts';
import { fetchApi, requireSession } from '../../../lib/session.ts';
import { canWriteStudents, FICHA_FIELDS, fichaSchema, fichaValue, PORTAL_LABELS, STATUS_LABELS } from '../../../lib/students.ts';
import { StudentsLoadError } from '../students-load-error.tsx';
import { CheckInsBlock } from './check-ins-block.tsx';
import { CheckInsLoadError } from './check-ins-load-error.tsx';
import { ConsentsBlock } from './consents-block.tsx';
import { ConsentsLoadError } from './consents-load-error.tsx';
import { EnrollmentsBlock } from './enrollments-block.tsx';
import { EnrollmentsLoadError } from './enrollments-load-error.tsx';
import { PaymentsBlock } from './payments-block.tsx';
import { PaymentsLoadError } from './payments-load-error.tsx';
import { PendingPhotoReview } from './pending-photo-review.tsx';
import { StatusActions } from './status-actions.tsx';

export const dynamic = 'force-dynamic';

/** A ficha como a API a devolve para este perfil, `notfound` ou `failed`. */
async function load(id: string): Promise<z.infer<typeof fichaSchema> | 'notfound' | 'failed'> {
  try {
    const response = await fetchApi(`/api/students/${encodeURIComponent(id)}`, await headers());
    if (response.status === 404) return 'notfound';
    if (response.status !== 200) return 'failed';
    return fichaSchema.parse(await response.json());
  } catch {
    return 'failed';
  }
}

/** A ficha de responsável e consentimentos, ou `failed`; só se pede a quem pode vê-la. */
async function loadConsents(id: string): Promise<StudentConsentsResponse | 'failed'> {
  try {
    const response = await fetchApi(`/api/students/${encodeURIComponent(id)}/consents`, await headers());
    if (response.status !== 200) return 'failed';
    return studentConsentsResponseSchema.parse(await response.json());
  } catch {
    return 'failed';
  }
}

/** As matrículas do aluno, na ordem da API, ou `failed`; só se pedem a quem pode vê-las. */
async function loadEnrollments(id: string): Promise<Enrollment[] | 'failed'> {
  try {
    const response = await fetchApi(`/api/students/${encodeURIComponent(id)}/enrollments`, await headers());
    if (response.status !== 200) return 'failed';
    return enrollmentsResponseSchema.parse(await response.json()).items;
  } catch {
    return 'failed';
  }
}

/** Os períodos do aluno com a situação de pagamento, na ordem da API, ou `failed`; só se pedem ao Financeiro. */
async function loadPayments(id: string): Promise<StudentPayment[] | 'failed'> {
  try {
    const response = await fetchApi(`/api/students/${encodeURIComponent(id)}/payments`, await headers());
    if (response.status !== 200) return 'failed';
    return studentPaymentsResponseSchema.parse(await response.json()).items;
  } catch {
    return 'failed';
  }
}

/** A primeira página do histórico de presença, na ordem da API, ou `failed`; só se pede ao balcão. */
async function loadCheckIns(id: string): Promise<StudentCheckInsResponse | 'failed'> {
  try {
    const response = await fetchApi(`/api/students/${encodeURIComponent(id)}/check-ins`, await headers());
    if (response.status !== 200) return 'failed';
    return studentCheckInsResponseSchema.parse(await response.json());
  } catch {
    return 'failed';
  }
}

/** Os grupos de campos da ficha (AC 53): os mesmos campos de antes, em "Identificação", "Contato" e "Emergência". */
const GROUPS = [
  { id: 'identity-fields-heading', title: 'Identificação', keys: ['cpf', 'birthDate', 'sex'] },
  { id: 'contact-fields-heading', title: 'Contato', keys: ['email', 'phone', 'address'] },
  {
    id: 'emergency-fields-heading',
    title: 'Emergência',
    keys: ['emergencyContactName', 'emergencyContactPhone', 'healthNotes'],
  },
] as const;

function FieldGroups({ student }: { student: z.infer<typeof fichaSchema> }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {GROUPS.map((group) => {
        const fields = FICHA_FIELDS.filter(
          ({ key }) => (group.keys as readonly string[]).includes(key) && key in student,
        );
        // o Instrutor recebe só `id`, `name` e `status`: o grupo sem campos não aparece
        if (fields.length === 0) return null;
        return (
          <section key={group.id} aria-labelledby={group.id} className="grid content-start gap-3">
            <h3 id={group.id} className="text-lg font-semibold">
              {group.title}
            </h3>
            <dl className="grid gap-3">
              {fields.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="break-words whitespace-pre-wrap">{fichaValue(student, key)}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const student = await load(id);
  const canWrite = canWriteStudents(session.user.role);
  // quem não vê o bloco não chega a pedir os dados dele; a API recusaria de qualquer forma
  const consents = typeof student === 'object' && canWrite ? await loadConsents(id) : undefined;
  // o Instrutor não vê matrículas, e os planos só servem a quem matricula
  const { role } = session.user;
  const [enrollments, plans] =
    typeof student === 'object' && canReadPlans(role)
      ? await Promise.all([loadEnrollments(id), canWritePlans(role) ? loadPlans().then((list) => list ?? 'failed') : undefined])
      : [];
  // o que o aluno deve é do Financeiro: os outros perfis nem chegam a pedir
  const payments = typeof student === 'object' && canReadPayments(role) ? await loadPayments(id) : undefined;
  // a presença é do balcão: o Financeiro e o Instrutor nem chegam a pedir
  const checkIns = typeof student === 'object' && canCheckIn(role) ? await loadCheckIns(id) : undefined;

  return (
    <Shell session={session}>
      {student === 'failed' ? (
        <>
          <ScreenHeader title="Aluno" />
          <StudentsLoadError />
        </>
      ) : student === 'notfound' ? (
        <>
          <ScreenHeader title="Aluno" />
          <p>Aluno não encontrado.</p>
        </>
      ) : (
        <>
          <ScreenHeader
            title={student.name}
            actions={
              canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" asChild>
                    <Link href={`/students/${student.id}/edit`}>Editar</Link>
                  </Button>
                  <StatusActions id={student.id} name={student.name} status={student.status} />
                </div>
              ) : undefined
            }
          />
          <div className={PAGE_BODY} data-slot="page-body">
            <div className={`grid gap-6 ${PANEL}`} data-slot="identity">
              <div className="flex flex-wrap items-start gap-6">
                <PhotoBlock
                  url={`/api/students/${student.id}/photo`}
                  conflict="Este aluno já tem foto."
                  name={student.name}
                  photoUrl={student.photoUrl}
                  canWrite={canWrite}
                />
                <div className="grid content-start gap-3">
                  <p className="text-xl font-medium" data-slot="identity-name">
                    {student.name}
                  </p>
                  {/* a situação e o portal acima dos campos: o primeiro `dd` da ficha é a situação */}
                  <dl className="grid gap-3">
                    <div>
                      <dt className="text-sm text-muted-foreground">Situação</dt>
                      <dd>
                        <StatusBadge variant="student" status={student.status}>
                          {STATUS_LABELS[student.status]}
                        </StatusBadge>
                      </dd>
                    </div>
                    {student.portal && (
                      <div>
                        <dt className="text-sm text-muted-foreground">Portal do aluno</dt>
                        <dd>
                          <StatusBadge variant="portal" status={student.portal}>
                            {PORTAL_LABELS[student.portal]}
                          </StatusBadge>
                        </dd>
                      </div>
                    )}
                  </dl>
                  {canWrite && student.pendingPhoto && (
                    <PendingPhotoReview studentId={student.id} name={student.name} pending={student.pendingPhoto} />
                  )}
                </div>
              </div>
              <FieldGroups student={student} />
            </div>
            {consents === 'failed' && <ConsentsLoadError />}
            {consents && consents !== 'failed' && (
              <ConsentsBlock
                studentId={student.id}
                studentName={student.name}
                minor={student.birthDate !== undefined && isMinor(student.birthDate, saoPauloToday())}
                data={consents}
              />
            )}
            {enrollments === 'failed' && <EnrollmentsLoadError />}
            {enrollments && enrollments !== 'failed' && (
              <EnrollmentsBlock
                studentId={student.id}
                studentName={student.name}
                studentStatus={student.status}
                items={enrollments}
                plans={plans}
              />
            )}
            {payments === 'failed' && <PaymentsLoadError />}
            {payments && payments !== 'failed' && (
              <PaymentsBlock studentId={student.id} studentName={student.name} items={payments} />
            )}
            {checkIns === 'failed' && <CheckInsLoadError />}
            {checkIns && checkIns !== 'failed' && <CheckInsBlock studentId={student.id} initial={checkIns} />}
            {canUsePrivacy(role) && <PrivacyBlock subject="student" id={student.id} name={student.name} />}
          </div>
        </>
      )}
    </Shell>
  );
}
