import type { Lead, Role } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { insertConvertedLead, insertLead, leadRow, leadRowText, nextEmail } from './support/leads.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { unknownId } from './support/students.ts';

let stack: Stack;
const sessions = {} as Record<Role, Client>;
const STAFF = ['admin', 'reception', 'hr_finance'] as const;

beforeAll(async () => {
  stack = await startStack();
  for (const role of [...STAFF, 'instructor'] as Role[]) sessions[role] = (await stack.session(role)).client;
}, 180_000);

afterAll(() => stack?.close());

const KEYS = ['id', 'name', 'email', 'phone', 'source', 'status', 'emailVerified', 'createdAt', 'studentId'];

/** A linha sem a coluna dada, para "as demais colunas idênticas". */
const without = (row: Record<string, unknown> | undefined, column: string) =>
  Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => key !== column));

test('list_open_leads_newest_first_same_body_for_three_roles', async () => {
  await stack.query('delete from leads');
  // dois com o mesmo `created_at`: no empate, o `id` maior vem primeiro
  const tieLow = '01900000-0000-7000-8000-00000000000a';
  const tieHigh = '01900000-0000-7000-8000-00000000000b';
  const older = await insertLead(stack, { created_at: '2026-10-01T09:00:00Z', name: 'Mais Antigo' });
  await insertLead(stack, { id: tieLow, status: 'contacted', created_at: '2026-10-03T09:00:00Z', name: 'Empate Baixo' });
  await insertLead(stack, { id: tieHigh, created_at: '2026-10-03T09:00:00Z', name: 'Empate Alto' });
  const newest = await insertLead(stack, { created_at: '2026-10-04T09:00:00Z', email_verified_at: '2026-10-04T10:00:00Z', source: 'google' });
  await insertLead(stack, { status: 'discarded', created_at: '2026-10-05T09:00:00Z' });
  await insertConvertedLead(stack, { created_at: '2026-10-06T09:00:00Z' });

  const bodies: string[] = [];
  for (const role of STAFF) {
    const response = await sessions[role].get('/api/leads');
    expect(response.status, role).toBe(200);
    bodies.push(await response.text());
  }
  expect(bodies[1]).toBe(bodies[0]);
  expect(bodies[2]).toBe(bodies[0]);

  const { items } = JSON.parse(bodies[0]!) as { items: Lead[] };
  expect(items.map((item) => item.id)).toEqual([newest, tieHigh, tieLow, older]);
  for (const item of items) expect(Object.keys(item).sort()).toEqual([...KEYS].sort());
  expect(items[0]).toMatchObject({ source: 'google', status: 'new', emailVerified: true, createdAt: '2026-10-04T09:00:00.000Z', studentId: null });
  expect(items[2]).toMatchObject({ status: 'contacted', emailVerified: false, name: 'Empate Baixo', phone: '11912345678' });
});

test('list_filter_four_statuses_and_three_invalid_422', async () => {
  await stack.query('delete from leads');
  const ids = {
    new: [await insertLead(stack, { created_at: '2026-10-01T09:00:00Z' }), await insertLead(stack, { created_at: '2026-10-02T09:00:00Z' })],
    contacted: [await insertLead(stack, { status: 'contacted' })],
    discarded: [await insertLead(stack, { status: 'discarded', created_at: '2026-10-01T09:00:00Z' }), await insertLead(stack, { status: 'discarded', created_at: '2026-10-03T09:00:00Z' })],
  };
  const converted = await insertConvertedLead(stack);

  const expected: Record<string, string[]> = {
    new: [ids.new[1]!, ids.new[0]!],
    contacted: ids.contacted,
    converted: [converted.id],
    discarded: [ids.discarded[1]!, ids.discarded[0]!],
  };
  for (const [status, order] of Object.entries(expected)) {
    const response = await sessions.reception.get(`/api/leads?status=${status}`);
    expect(response.status, status).toBe(200);
    const { items } = (await response.json()) as { items: Lead[] };
    expect(items.map((item) => item.id), status).toEqual(order);
    for (const item of items) {
      expect(item.status, status).toBe(status);
      expect(item.studentId, status).toBe(status === 'converted' ? converted.studentId : null);
    }
  }

  for (const value of ['lead', '', 'NEW']) {
    const response = await sessions.admin.get(`/api/leads?status=${value}`);
    expect(response.status, value).toBe(422);
    expect((await problem(response)).errors?.map((error) => error.path), value).toEqual(['status']);
  }
});

test('patch_five_transitions_200_by_three_roles', async () => {
  const transitions = [
    ['new', 'contacted'],
    ['contacted', 'discarded'],
    ['discarded', 'new'],
    ['new', 'discarded'],
    ['contacted', 'new'],
  ] as const;
  for (const role of STAFF) {
    for (const [from, to] of transitions) {
      const id = await insertLead(stack, { status: from });
      const before = await leadRow(stack, id);

      const response = await sessions[role].patch(`/api/leads/${id}`, { status: to });

      expect(response.status, `${role} ${from}->${to}`).toBe(200);
      const item = (await response.json()) as Lead;
      expect(Object.keys(item).sort()).toEqual([...KEYS].sort());
      expect(item).toMatchObject({ id, status: to, email: before!.email, name: before!.name, studentId: null });
      const after = await leadRow(stack, id);
      expect(after!.status).toBe(to);
      expect(without(after, 'status'), `${role} ${from}->${to}`).toEqual(without(before, 'status'));
    }
  }
});

test('patch_six_invalid_statuses_422', async () => {
  const id = await insertLead(stack);
  const before = await leadRowText(stack, id);
  for (const body of [{ status: 'converted' }, { status: 'New' }, { status: '' }, { status: null }, { other: 'x' }, {}]) {
    const response = await sessions.admin.patch(`/api/leads/${id}`, body);
    expect(response.status, JSON.stringify(body)).toBe(422);
    expect((await problem(response)).errors?.map((error) => error.path), JSON.stringify(body)).toEqual(['status']);
  }
  expect(await leadRowText(stack, id)).toBe(before);
});

test('patch_converted_lead_409', async () => {
  const { id } = await insertConvertedLead(stack);
  const before = await leadRowText(stack, id);
  for (const status of ['new', 'contacted', 'discarded']) {
    const response = await sessions.reception.patch(`/api/leads/${id}`, { status });
    expect(response.status, status).toBe(409);
    expect((await problem(response)).code, status).toBe('lead_converted');
  }
  expect(await leadRowText(stack, id)).toBe(before);
});

test('reopen_discarded_with_open_sibling_409_lead_email_open', async () => {
  const email = nextEmail('reaberto');
  const discarded = await insertLead(stack, { email, status: 'discarded' });
  const open = await insertLead(stack, { email });
  const before = await leadRowText(stack, discarded);

  for (const status of ['new', 'contacted']) {
    const response = await sessions.hr_finance.patch(`/api/leads/${discarded}`, { status });
    expect(response.status, status).toBe(409);
    expect((await problem(response)).code, status).toBe('lead_email_open');
  }
  expect(await leadRowText(stack, discarded)).toBe(before);

  await stack.query('delete from leads where id = $1', [open]);
  const response = await sessions.hr_finance.patch(`/api/leads/${discarded}`, { status: 'contacted' });
  expect(response.status).toBe(200);
  expect(((await response.json()) as Lead).status).toBe('contacted');
});

test('instructor_403_and_no_session_401', async () => {
  const id = await insertLead(stack, { name: 'Não Mostrar' });
  const before = await leadRowText(stack, id);
  const trail = await auditCount(stack);
  const forbidden = [
    () => sessions.instructor.get('/api/leads'),
    () => sessions.instructor.patch(`/api/leads/${id}`, { status: 'contacted' }),
    () => sessions.instructor.patch(`/api/leads/${unknownId()}`, { status: 'contacted' }),
  ];
  for (const send of forbidden) {
    const response = await send();
    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.code).toBe('forbidden');
    for (const key of ['name', 'email', 'phone', 'items']) expect(body).not.toHaveProperty(key);
    expect(JSON.stringify(body)).not.toContain('Não Mostrar');
  }

  const anonymous = stack.client();
  for (const response of [await anonymous.get('/api/leads'), await anonymous.patch(`/api/leads/${id}`, { status: 'contacted' })]) {
    expect(response.status).toBe(401);
    expect((await problem(response)).code).toBe('unauthorized');
  }
  expect(await leadRowText(stack, id)).toBe(before);
  expect(await auditCount(stack)).toBe(trail);
});

test('patch_404_for_non_uuid_and_unknown_uuid', async () => {
  for (const [client, path] of [
    [sessions.admin, '/api/leads/abc'],
    [sessions.admin, `/api/leads/${unknownId()}`],
    [sessions.reception, `/api/leads/${unknownId()}`],
  ] as const) {
    const response = await client.patch(path, { status: 'contacted' });
    expect(response.status, path).toBe(404);
    expect((await problem(response)).code, path).toBe('not_found');
  }
});
