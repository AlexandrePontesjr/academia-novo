import { type OpenPayment, type OpenPaymentStatus, openPaymentsResponseSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { fetchApi } from './session.ts';

/** Os períodos por pagar como a API os devolve, na ordem dela, ou `undefined` quando ela não os entrega. */
export async function loadOpenPayments(status?: OpenPaymentStatus): Promise<OpenPayment[] | undefined> {
  try {
    const response = await fetchApi(status ? `/api/payments?status=${status}` : '/api/payments', await headers());
    if (response.status !== 200) return undefined;
    return openPaymentsResponseSchema.parse(await response.json()).items;
  } catch {
    return undefined;
  }
}
