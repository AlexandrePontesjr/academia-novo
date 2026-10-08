import { type Plan, plansResponseSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { fetchApi } from './session.ts';

/** Os planos como a API os devolve, de qualquer situação e na ordem dela, ou `undefined` quando ela não os entrega. */
export async function loadPlans(): Promise<Plan[] | undefined> {
  try {
    const response = await fetchApi('/api/plans', await headers());
    if (response.status !== 200) return undefined;
    return plansResponseSchema.parse(await response.json()).items;
  } catch {
    return undefined;
  }
}
