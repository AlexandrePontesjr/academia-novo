import { TwoFactorForm } from './two-factor-form.tsx';

export default function LoginTwoFactorPage() {
  return (
    <main className="mx-auto grid max-w-sm gap-6 p-6 pt-16">
      <h1 className="text-2xl font-semibold">Verificação em duas etapas</h1>
      <TwoFactorForm />
    </main>
  );
}
