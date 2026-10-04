import type { Role, StudentConsentsResponse } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  createAdult,
  createMinorWithGuardian,
  currentGuardianId,
  guardianBody,
  insertConsent,
} from './support/consents.ts';
import { type Stack, startStack } from './support/stack.ts';

let stack: Stack;
let reception: Client;
let counter = 6000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  reception = (await stack.session('reception')).client;
}, 180_000);

afterAll(() => stack?.close());

const ficha = async (client: Client, studentId: string) => {
  const response = await client.get(`/api/students/${studentId}/consents`);
  return { response, body: (await response.json()) as StudentConsentsResponse };
};

test('ficha_200_current_guardian_and_all_items_newest_first', async () => {
  const minor = await createMinorWithGuardian(reception, next());
  // cinco trocas seguidas: a quinta é a atual, e só é a de maior `id` se o uuid v7 ordena as trocas
  for (let swap = 1; swap <= 5; swap += 1) {
    const response = await reception.patch(`/api/students/${minor.id}`, {
      guardian: guardianBody({ phone: `119000000${swap}` }),
    });
    expect(response.status, `troca ${swap}`).toBe(200);
  }
  const guardianId = (await currentGuardianId(stack, minor.id))!;
  const oldest = await insertConsent(stack, {
    studentId: minor.id,
    purpose: 'data_processing',
    grantedBy: 'guardian',
    guardianId,
    grantedAt: '2026-01-01T12:00:00Z',
    revokedAt: '2026-02-01T12:00:00Z',
  });
  const middle = await insertConsent(stack, {
    studentId: minor.id,
    purpose: 'data_processing',
    grantedBy: 'guardian',
    guardianId,
    grantedAt: '2026-03-01T12:00:00Z',
  });
  const newest = await insertConsent(stack, {
    studentId: minor.id,
    purpose: 'image_use',
    grantedBy: 'guardian',
    guardianId,
    grantedAt: '2026-04-01T12:00:00Z',
  });

  for (const role of ['admin', 'reception'] as Role[]) {
    const { client } = await stack.session(role);

    const { response, body } = await ficha(client, minor.id);

    expect(response.status, role).toBe(200);
    expect(Object.keys(body).sort(), role).toEqual(['guardian', 'items']);
    expect(Object.keys(body.guardian!).sort(), role).toEqual(
      ['cpf', 'createdAt', 'id', 'name', 'phone', 'relationship'].sort(),
    );
    expect(body.guardian, role).toMatchObject({ id: guardianId, phone: '1190000005', cpf: '52998224725' });
    expect(body.items.map((item) => item.id), role).toEqual([newest, middle, oldest]);
    for (const item of body.items) {
      expect(Object.keys(item).sort(), role).toEqual(
        ['grantedAt', 'grantedBy', 'guardian', 'id', 'purpose', 'revokedAt', 'termVersion'].sort(),
      );
    }
    expect(body.items[2]!.revokedAt, role).toBe('2026-02-01T12:00:00.000Z');
  }
});

test('item_guardian_is_the_one_at_grant_time', async () => {
  const student = await createAdult(reception, next(), { guardian: guardianBody() });
  const first = (await currentGuardianId(stack, student.id))!;
  await insertConsent(stack, { studentId: student.id, purpose: 'image_use', grantedBy: 'guardian', guardianId: first });
  await insertConsent(stack, { studentId: student.id, purpose: 'data_processing', grantedBy: 'student' });

  const swap = await reception.patch(`/api/students/${student.id}`, {
    guardian: guardianBody({ name: 'Beatriz Souza', cpf: '123.456.789-09' }),
  });
  expect(swap.status).toBe(200);
  const second = (await currentGuardianId(stack, student.id))!;

  const { body } = await ficha(reception, student.id);

  expect(second).not.toBe(first);
  expect(body.guardian).toMatchObject({ id: second, name: 'Beatriz Souza' });
  const byGuardian = body.items.find((item) => item.grantedBy === 'guardian')!;
  expect(byGuardian.guardian).toEqual({ id: first, name: 'Ana Souza' });
  expect(body.items.find((item) => item.grantedBy === 'student')!.guardian).toBeNull();
});

test('ficha_200_empty_for_student_without_anything', async () => {
  const student = await createAdult(reception, next());

  const response = await reception.get(`/api/students/${student.id}/consents`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ guardian: null, items: [] });
});

test('reading_consents_writes_no_audit_row', async () => {
  const student = await createAdult(reception, next());
  // o login de cada sessão também grava na trilha: as sessões nascem antes da contagem de partida
  const sessions = [await stack.session('admin'), await stack.session('reception')];

  for (const { user, client } of sessions) {
    for (const path of ['/api/consent-terms', `/api/students/${student.id}/consents`]) {
      const before = await auditCount(stack);

      const response = await client.get(path);

      expect(response.status, `${user.role} ${path}`).toBe(200);
      expect(await auditCount(stack), `${user.role} ${path}`).toBe(before);
    }
  }
});
