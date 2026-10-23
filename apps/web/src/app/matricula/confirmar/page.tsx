import { SITE } from '../../site-content.ts';
import { MatriculaFrame } from '../matricula-frame.tsx';
import { ConfirmButton } from './confirm-button.tsx';

export const dynamic = 'force-dynamic';

/** A página do link do e-mail: abrir não grava nada, o botão confirma (door 3). */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;

  return (
    <MatriculaFrame title={SITE.matricula.confirmTitle}>
      <ConfirmButton token={typeof token === 'string' ? token : ''} />
    </MatriculaFrame>
  );
}
