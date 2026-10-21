import { AuthFrame } from '../../components/auth-frame.tsx';
import { Brand } from '../../components/brand.tsx';
import { LoginForm } from './login-form.tsx';

// o nonce do CSP é gerado por requisição (door 2): a página não pode ser estática
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <AuthFrame>
      <main className="grid w-full max-w-sm gap-8 px-4 pt-16 pb-10 lg:py-10">
        <Brand />
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" data-slot="eyebrow-dot" />
            Acesso da equipe
          </p>
          <h1 className="text-4xl font-medium">Bem-vindo de volta</h1>
          <p className="text-sm text-muted-foreground">Entre para acompanhar alunos, matrículas e presenças da DukFit.</p>
        </div>
        <LoginForm />
      </main>
    </AuthFrame>
  );
}
