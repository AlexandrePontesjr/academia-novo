import { type Student, studentSchema } from '@academia/contracts';
import { Button } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Shell } from '../../../components/shell.tsx';
import { fetchApi, requireSession } from '../../../lib/session.ts';
import { canWriteStudents, FICHA_FIELDS, fichaValue, STATUS_LABELS } from '../../../lib/students.ts';
import { StudentsLoadError } from '../students-load-error.tsx';
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

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const student = await load(id);
  const canWrite = canWriteStudents(session.user.role);

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
        </>
      )}
    </Shell>
  );
}
