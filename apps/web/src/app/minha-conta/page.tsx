import { AuthFrame } from '../../components/auth-frame.tsx';
import { Brand } from '../../components/brand.tsx';
import { SignOutButton } from '../../components/sign-out-button.tsx';
import { requireSession } from '../../lib/session.ts';

export const dynamic = 'force-dynamic';

/** A área do aluno (door 6). O perfil, os pagamentos e a foto entram nas S5 a S7 da `portal-aluno`. */
export default async function MyAccountPage() {
  const session = await requireSession();

  return (
    <AuthFrame>
      <main className="grid w-full max-w-sm gap-8 px-4 pt-16 pb-10 lg:py-10">
        <Brand />
        <div className="grid gap-3">
          <h1 className="text-4xl font-medium">Minha conta</h1>
          <p className="text-sm text-muted-foreground">{session.user.name}</p>
        </div>
        <div>
          <SignOutButton />
        </div>
      </main>
    </AuthFrame>
  );
}
