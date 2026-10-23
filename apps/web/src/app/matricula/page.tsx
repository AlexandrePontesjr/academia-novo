import { type LeadOptionsResponse, leadOptionsResponseSchema } from '@academia/contracts';
import { Alert } from '@academia/ui';
import { headers } from 'next/headers';
import { fetchApi } from '../../lib/session.ts';
import { SITE } from '../site-content.ts';
import { LeadForm } from './lead-form.tsx';
import { MatriculaFrame } from './matricula-frame.tsx';

// o nonce do CSP é gerado por requisição: a página não pode ser estática (door 11)
export const dynamic = 'force-dynamic';

/** O termo vigente e se o Google está ligado; `undefined` quando a API não responde. */
async function loadOptions(): Promise<LeadOptionsResponse | undefined> {
  try {
    const response = await fetchApi('/api/leads/options', await headers());
    if (response.status !== 200) return undefined;
    return leadOptionsResponseSchema.parse(await response.json());
  } catch {
    return undefined;
  }
}

export default async function MatriculaPage({ searchParams }: { searchParams: Promise<{ google?: string | string[] }> }) {
  const options = await loadOptions();
  const { google } = await searchParams;

  return (
    <MatriculaFrame title={SITE.matricula.title} intro={SITE.matricula.intro}>
      {options ? (
        <LeadForm options={options} google={google === 'ok' || google === 'erro' ? google : undefined} />
      ) : (
        <Alert variant="destructive">{SITE.matricula.unavailable}</Alert>
      )}
    </MatriculaFrame>
  );
}
