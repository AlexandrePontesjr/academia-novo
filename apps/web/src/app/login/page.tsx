import { Alert } from '@academia/ui';
import Link from 'next/link';
import { AuthFrame } from '../../components/auth-frame.tsx';
import { Brand } from '../../components/brand.tsx';
import { LoginForm } from './login-form.tsx';

// o nonce do CSP é gerado por requisição (door 2): a página não pode ser estática
export const dynamic = 'force-dynamic';

/** `?senha=definida` vem de `/definir-senha` depois do `204` (portal-aluno, AC 25). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ senha?: string | string[] }> }) {
  const { senha } = await searchParams;

  return (
    <AuthFrame>
      <main className="grid w-full max-w-sm gap-8 px-4 pt-16 pb-10 lg:py-10">
        <Brand />
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" data-slot="eyebrow-dot" />
            Acesso ao sistema
          </p>
          <h1 className="text-4xl font-medium">Bem-vindo de volta</h1>
          <p className="text-sm text-muted-foreground">Entre para acompanhar alunos, matrículas e presenças da DukFit.</p>
        </div>
        {senha === 'definida' && <Alert>Senha definida. Entre com seu e-mail e a nova senha.</Alert>}
        <LoginForm />
        <nav aria-label="Portal do aluno" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/primeiro-acesso" className="text-primary underline underline-offset-4">
            Sou aluno
          </Link>
          <Link href="/esqueci-senha" className="text-primary underline underline-offset-4">
            Esqueci minha senha
          </Link>
        </nav>
      </main>
    </AuthFrame>
  );
}
