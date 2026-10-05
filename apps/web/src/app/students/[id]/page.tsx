import {
  isMinor,
  saoPauloToday,
  type Student,
  type StudentConsentsResponse,
  studentConsentsResponseSchema,
  studentSchema,
} from '@academia/contracts';
import { Button } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Shell } from '../../../components/shell.tsx';
import { fetchApi, requireSession } from '../../../lib/session.ts';
import { canWriteStudents, FICHA_FIELDS, fichaValue, STATUS_LABELS } from '../../../lib/students.ts';
import { StudentsLoadError } from '../students-load-error.tsx';
import { ConsentsBlock } from './consents-block.tsx';
import { ConsentsLoadError } from './consents-load-error.tsx';
import { PhotoBlock } from './photo-block.tsx';
import { StatusActions } from './status-actions.tsx';

export const dynamic = 'force-dynamic';

/** A ficha como a API a devolve para este perfil, `notfound` ou `failed`. */
async function load(id: string): Promise<Student | 'notfound' | 'failed'> {
  try {
    const response = await fetchApi(`/api/students/${encodeURIComponent(id)}`, await headers());
    if (response.status === 404) return 'notfound';
    if (response.status !== 200) return 'failed';
    return studentSchema.parse(await response.json());
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

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const student = await load(id);
  const canWrite = canWriteStudents(session.user.role);
  // quem não vê o bloco não chega a pedir os dados dele; a API recusaria de qualquer forma
  const consents = typeof student === 'object' && canWrite ? await loadConsents(id) : undefined;

  return (
    <Shell session={session}>
      {student === 'failed' ? (
        <StudentsLoadError />
      ) : student === 'notfound' ? (
        <p>Aluno não encontrado.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">{student.name}</h2>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link href={`/students/${student.id}/edit`}>Editar</Link>
                </Button>
                <StatusActions id={student.id} name={student.name} status={student.status} />
              </div>
            )}
          </div>
          <PhotoBlock studentId={student.id} name={student.name} photoUrl={student.photoUrl} canWrite={canWrite} />
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Situação</dt>
              <dd>{STATUS_LABELS[student.status]}</dd>
            </div>
            {FICHA_FIELDS.filter(({ key }) => key in student).map(({ key, label }) => (
              <div key={key}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="break-words whitespace-pre-wrap">{fichaValue(student, key)}</dd>
              </div>
            ))}
          </dl>
          {consents === 'failed' && <ConsentsLoadError />}
          {consents && consents !== 'failed' && (
            <ConsentsBlock
              studentId={student.id}
              studentName={student.name}
              minor={student.birthDate !== undefined && isMinor(student.birthDate, saoPauloToday())}
              data={consents}
            />
          )}
        </>
      )}
    </Shell>
  );
}
