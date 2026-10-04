import { Shell } from '../components/shell.tsx';
import { requireSession } from '../lib/session.ts';

// A sessão é conferida a cada requisição, nunca no build.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <p>Olá, {session.user.name}. Escolha uma opção no menu acima.</p>
    </Shell>
  );
}
