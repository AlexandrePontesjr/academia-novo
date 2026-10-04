import type { Role } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { insertTerm, termText } from './support/consents.ts';
import { type Stack, startStack } from './support/stack.ts';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

test('terms_200_one_per_purpose_for_admin_and_reception', async () => {
  for (const role of ['admin', 'reception'] as Role[]) {
    const { client } = await stack.session(role);

    const response = await client.get('/api/consent-terms');
    const body = (await response.json()) as { items: Array<Record<string, unknown>> };

    expect(response.status, role).toBe(200);
    expect(Object.keys(body), role).toEqual(['items']);
    expect(body.items, role).toHaveLength(2);
    expect(body.items.map((item) => item.purpose).sort(), role).toEqual(['data_processing', 'image_use']);
    for (const item of body.items) {
      expect(Object.keys(item).sort(), `${role} ${item.purpose}`).toEqual(['createdAt', 'purpose', 'text', 'version']);
      expect(item.version, `${role} ${item.purpose}`).toBe(1);
      expect(item.text, `${role} ${item.purpose}`).toBe(await termText(stack, item.purpose as string, 1));
    }
  }
});

test('terms_returns_only_the_highest_version_numerically', async () => {
  // o termo é append-only: quem publica uma versão sobe o banco dele
  const own = await startStack();
  try {
    await insertTerm(own, 'data_processing', 2, 'versão 2 de dados');
    await insertTerm(own, 'data_processing', 10, 'versão 10 de dados');
    const { client } = await own.session('reception');

    const response = await client.get('/api/consent-terms');
    const body = (await response.json()) as { items: Array<{ purpose: string; version: number; text: string }> };

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
    const data = body.items.find((item) => item.purpose === 'data_processing')!;
    expect(data.version).toBe(10);
    expect(data.text).toBe('versão 10 de dados');
    expect(body.items.find((item) => item.purpose === 'image_use')!.version).toBe(1);
  } finally {
    await own.close();
  }
});
