import { Wordmark } from '../../components/wordmark.tsx';
import { LoginForm } from './login-form.tsx';

// o nonce do CSP é gerado por requisição (door 2): a página não pode ser estática
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="mx-auto grid max-w-sm gap-8 px-4 pt-16 pb-10">
      <Wordmark />
      <div className="grid gap-2">
        <h1 className="text-3xl font-bold">Bem-vindo de volta</h1>
        <p className="text-sm text-muted-foreground">Entre para acompanhar alunos, matrículas e presenças da DukFit.</p>
      </div>
      <LoginForm />
    </main>
  );
}
