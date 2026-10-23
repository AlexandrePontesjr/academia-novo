import { type Lead, type LeadStatus, leadsResponseSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { fetchApi } from './session.ts';

/** Os interessados de uma situação, ou os abertos, na ordem da API; `undefined` quando ela não os entrega. */
export async function loadLeads(status?: LeadStatus): Promise<Lead[] | undefined> {
  try {
    const response = await fetchApi(status ? `/api/leads?status=${status}` : '/api/leads', await headers());
    if (response.status !== 200) return undefined;
    return leadsResponseSchema.parse(await response.json()).items;
  } catch {
    return undefined;
  }
}
