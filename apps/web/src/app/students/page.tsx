import { type StudentsResponse, studentsResponseSchema } from '@academia/contracts';
import { Alert, Button } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Shell } from '../../components/shell.tsx';
import { ANONYMIZED_NOTICE } from '../../lib/privacy.ts';
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

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ anonymized?: string | string[] }> }) {
  const session = await requireSession();
  const page = await load();
  // a ficha anonimizada leva de volta à lista com o aviso (privacidade)
  const anonymized = (await searchParams).anonymized === '1';

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
      {anonymized && <Alert>{ANONYMIZED_NOTICE}</Alert>}
      {page ? <StudentsList initial={page} role={session.user.role} /> : <StudentsLoadError />}
    </Shell>
  );
}
