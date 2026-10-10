import { type DashboardResponse, dashboardResponseSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { fetchApi } from './session.ts';

/** O painel como a API o devolve para quem pediu a página, ou `undefined` quando ela não o entrega. */
export async function loadDashboard(): Promise<DashboardResponse | undefined> {
  try {
    const response = await fetchApi('/api/dashboard', await headers());
    if (response.status !== 200) return undefined;
    return dashboardResponseSchema.parse(await response.json());
  } catch {
    return undefined;
  }
}
