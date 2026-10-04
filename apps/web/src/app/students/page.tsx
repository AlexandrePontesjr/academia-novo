import { type StudentsResponse, studentsResponseSchema } from '@academia/contracts';
import { Button } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Shell } from '../../components/shell.tsx';
import { fetchApi, requireSession } from '../../lib/session.ts';
import { canWriteStudents } from '../../lib/students.ts';
import { StudentsList } from './students-list.tsx';
import { StudentsLoadError } from './students-load-error.tsx';

export const dynamic = 'force-dynamic';

/** A primeira página da lista, sem busca, ou `undefined` quando a API não a entrega. */
async function load(): Promise<StudentsResponse | undefined> {
  try {
    const response = await fetchApi('/api/students', await headers());
    if (response.status !== 200) return undefined;
    return studentsResponseSchema.parse(await response.json());
  } catch {
    return undefined;
  }
}

export default async function StudentsPage() {
  const session = await requireSession();
  const page = await load();

  return (
    <Shell session={session}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Alunos</h2>
        {canWriteStudents(session.user.role) && (
          <Button asChild>
            <Link href="/students/new">Novo aluno</Link>
          </Button>
        )}
      </div>
      {page ? <StudentsList initial={page} role={session.user.role} /> : <StudentsLoadError />}
    </Shell>
  );
}
