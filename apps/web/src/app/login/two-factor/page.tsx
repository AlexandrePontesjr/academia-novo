import { AuthFrame } from '../../../components/auth-frame.tsx';
import { TwoFactorForm } from './two-factor-form.tsx';

// o nonce do CSP é gerado por requisição (door 2): a página não pode ser estática
export const dynamic = 'force-dynamic';

export default function LoginTwoFactorPage() {
  return (
    <AuthFrame>
      <main className="grid w-full max-w-sm gap-6 p-6 pt-16 lg:py-10">
        <h1 className="text-3xl font-medium">Verificação em duas etapas</h1>
        <TwoFactorForm />
      </main>
    </AuthFrame>
  );
}
