import { TwoFactorForm } from './two-factor-form.tsx';

// o nonce do CSP é gerado por requisição (door 2): a página não pode ser estática
export const dynamic = 'force-dynamic';

export default function LoginTwoFactorPage() {
  return (
    <main className="mx-auto grid max-w-sm gap-6 p-6 pt-16">
      <h1 className="text-2xl font-semibold">Verificação em duas etapas</h1>
      <TwoFactorForm />
    </main>
  );
}
