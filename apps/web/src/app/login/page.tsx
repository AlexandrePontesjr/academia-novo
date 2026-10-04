import { LoginForm } from './login-form.tsx';

export default function LoginPage() {
  return (
    <main className="mx-auto grid max-w-sm gap-6 p-6 pt-16">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <LoginForm />
    </main>
  );
}
