import { type StudentsResponse, studentsResponseSchema } from '@academia/contracts';
import { Alert, Button, ScreenHeader } from '@academia/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Shell } from '../../components/shell.tsx';
import { ANONYMIZED_NOTICE } from '../../lib/privacy.ts';
import { fetchApi, requireSession } from '../../lib/session.ts';
import { canWriteStudents } from '../../lib/students.ts';
import { PAGE_BODY } from '../../components/page-body.ts';
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
      <ScreenHeader
        title="Alunos"
        actions={
          canWriteStudents(session.user.role) ? (
            <Button asChild>
              <Link href="/students/new">Novo aluno</Link>
            </Button>
          ) : undefined
        }
      />
      <div className={PAGE_BODY} data-slot="page-body">
        {anonymized && <Alert>{ANONYMIZED_NOTICE}</Alert>}
        {page ? <StudentsList initial={page} role={session.user.role} /> : <StudentsLoadError />}
      </div>
    </Shell>
  );
}
