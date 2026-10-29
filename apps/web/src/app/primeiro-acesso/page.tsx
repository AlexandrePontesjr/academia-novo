import { PortalFrame } from '../../components/portal-frame.tsx';
import { FirstAccessForm } from './first-access-form.tsx';

// o nonce do CSP é gerado por requisição (door 2): a página não pode ser estática
export const dynamic = 'force-dynamic';

export default function FirstAccessPage() {
  return (
    <PortalFrame title="Primeiro acesso" intro="Informe o CPF e o e-mail que estão na sua ficha da academia.">
      <FirstAccessForm />
    </PortalFrame>
  );
}
