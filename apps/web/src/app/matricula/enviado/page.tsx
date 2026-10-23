import { SITE } from '../../site-content.ts';
import { MatriculaFrame } from '../matricula-frame.tsx';

export const dynamic = 'force-dynamic';

/** Depois do envio: o link foi enviado, ou, pelo Google, o e-mail já está confirmado. */
export default async function SentPage({ searchParams }: { searchParams: Promise<{ confirmado?: string | string[] }> }) {
  const { confirmado } = await searchParams;

  return (
    <MatriculaFrame title={SITE.matricula.title}>
      <p role="status" className="text-lg">
        {confirmado === undefined ? SITE.matricula.sent : SITE.matricula.confirmed}
      </p>
    </MatriculaFrame>
  );
}
