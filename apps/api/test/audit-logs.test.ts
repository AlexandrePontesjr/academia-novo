import { randomUUID } from 'node:crypto';
import type { AuditLogsResponse } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { problem, type Stack, startStack } from './support/stack.ts';

interface NewRow {
  user_id?: string | null;
  action?: string;
  entity?: string;
  entity_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  diff?: unknown;
  created_at: Date;
}

let stack: Stack;
let admin: Client;

beforeAll(async () => {
  stack = await startStack();
  admin = (await stack.session('admin')).client;
}, 180_000);

afterAll(() => stack?.close());

/** Linhas inseridas por SQL, com o `created_at` que o teste escolhe; devolve os ids, na ordem dada. */
async function insert(rows: NewRow[], into: Stack = stack) {
  const ids: string[] = [];
  for (const row of rows) {
    const [inserted] = await into.query<{ id: string }>(
      `insert into audit_logs (user_id, action, entity, entity_id, ip, user_agent, diff, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        row.user_id ?? null,
        row.action ?? 'user.updated',
        row.entity ?? 'user',
        row.entity_id ?? null,
        row.ip ?? null,
        row.user_agent ?? null,
        row.diff === undefined ? null : JSON.stringify(row.diff),
        row.created_at,
      ],
    );
    ids.push(inserted!.id);
  }
  return ids;
}

/** A ordem da trilha lida do banco de uma vez só: `created_at` e `id` decrescentes. */
const inDatabaseOrder = async (where = 'true', values: unknown[] = [], from: Stack = stack) =>
  (
    await from.query<{ id: string }>(
      `select id from audit_logs where ${where} order by created_at desc, id desc`,
      values,
    )
  ).map((row) => row.id);

async function list(params: Record<string, string> = {}, client: Client = admin) {
  const response = await client.get(`/api/audit-logs?${new URLSearchParams(params)}`);
  expect(response.status, JSON.stringify(params)).toBe(200);
  return (await response.json()) as AuditLogsResponse;
}

/** Instantes à frente de tudo o que os outros testes gravam, um bloco de dias por teste. */
let block = 0;
function futureBase() {
  block += 1;
  return Date.now() + block * 86_400_000;
}

test('only_get_is_registered_under_audit_logs', () => {
  const routes = stack.api
    .routes()
    .filter(({ path }) => path === '/api/audit-logs' || path.startsWith('/api/audit-logs/'))
    .map(({ method, path }) => `${method} ${path}`);

  expect(routes).toEqual(['GET /api/audit-logs']);
});

test('list_200_fifty_newest_first_with_nine_keys', async () => {
  const base = futureBase();
  await insert(Array.from({ length: 60 }, (_, index) => ({ created_at: new Date(base + index * 1000) })));
  const expected = (await inDatabaseOrder()).slice(0, 50);

  const response = await admin.get('/api/audit-logs');
  const { items } = (await response.json()) as AuditLogsResponse;

  expect(response.status).toBe(200);
  expect(items).toHaveLength(50);
  expect(items.map((item) => item.id)).toEqual(expected);
  const instants = items.map((item) => Date.parse(item.createdAt));
  expect(instants).toEqual([...instants].sort((a, b) => b - a));
  expect(instants[0]).toBe(base + 59_000);
  for (const item of items) {
    expect(Object.keys(item).sort()).toEqual(
      ['id', 'createdAt', 'user', 'action', 'entity', 'entityId', 'ip', 'userAgent', 'diff'].sort(),
    );
  }
});

test('user_is_current_name_or_null', async () => {
  const author = await stack.seed({ name: 'Nome da autora' });
  const base = futureBase();
  const [withAuthor, withoutAuthor] = await insert([
    { user_id: author.id, entity: 'autoria', created_at: new Date(base + 1000) },
    { user_id: null, entity: 'autoria', created_at: new Date(base) },
  ]);

  const before = await list({ entity: 'autoria' });

  expect(before.items.map((item) => item.id)).toEqual([withAuthor, withoutAuthor]);
  expect(before.items[0]!.user).toStrictEqual({ id: author.id, name: 'Nome da autora' });
  expect(before.items[1]!.user).toBeNull();

  expect((await admin.patch(`/api/users/${author.id}`, { name: 'Nome trocado' })).status).toBe(200);
  const after = await list({ entity: 'autoria' });

  expect(after.items[0]!.id).toBe(withAuthor);
  expect(after.items[0]!.user).toStrictEqual({ id: author.id, name: 'Nome trocado' });
});

test('cursor_walks_every_row_once_even_with_equal_instants', async () => {
  const base = futureBase();
  const sameInstant = new Date(base + 30_000);
  await insert([
    ...Array.from({ length: 60 }, (_, index) => ({ entity: 'caminhada', created_at: new Date(base + index * 100) })),
    ...Array.from({ length: 60 }, () => ({ entity: 'caminhada', created_at: sameInstant })),
  ]);
  const expected = await inDatabaseOrder('entity = $1', ['caminhada']);
  expect(expected).toHaveLength(120);

  const walked: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: AuditLogsResponse = await list({ entity: 'caminhada', ...(cursor && { cursor }) });
    walked.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor !== null && pages < 10);

  expect(cursor).toBeNull();
  expect(walked).toHaveLength(120);
  expect(new Set(walked).size).toBe(120);
  expect(walked).toEqual(expected);
});

test('next_cursor_null_at_50_and_set_at_51', async () => {
  // um banco só deste teste, para a contagem total ser exata
  const own = await startStack();
  try {
    const client = (await own.session('admin')).client;
    const existing = await auditCount(own);
    expect(existing).toBeLessThan(50);
    const base = Date.now() + 86_400_000;
    await insert(
      Array.from({ length: 50 - existing }, (_, index) => ({ created_at: new Date(base + index) })),
      own,
    );
    expect(await auditCount(own)).toBe(50);

    const atFifty = await list({}, client);

    expect(atFifty.items).toHaveLength(50);
    expect(atFifty.nextCursor).toBeNull();

    await insert([{ created_at: new Date(base + 1000) }], own);
    expect(await auditCount(own)).toBe(51);
    const atFiftyOne = await list({}, client);

    expect(atFiftyOne.items).toHaveLength(50);
    expect(atFiftyOne.nextCursor).not.toBeNull();
    expect(atFiftyOne.nextCursor).toMatch(/\S/);
  } finally {
    await own.close();
  }
});

test('rows_written_between_pages_do_not_shift_the_next_page', async () => {
  const base = futureBase();
  await insert(
    Array.from({ length: 60 }, (_, index) => ({ entity: 'entre_paginas', created_at: new Date(base + index * 1000) })),
  );
  const expected = (await inDatabaseOrder('entity = $1', ['entre_paginas'])).slice(50);
  expect(expected).toHaveLength(10);

  const first = await list({ entity: 'entre_paginas' });
  expect(first.items).toHaveLength(50);
  await insert(
    Array.from({ length: 5 }, (_, index) => ({
      entity: 'entre_paginas',
      created_at: new Date(base + 120_000 + index),
    })),
  );
  const second = await list({ entity: 'entre_paginas', cursor: first.nextCursor! });

  expect(second.items.map((item) => item.id)).toEqual(expected);
  expect(second.nextCursor).toBeNull();
});

test('five_equality_filters_alone_and_combined', async () => {
  const [ana, bia] = [await stack.seed(), await stack.seed()];
  const [targetOne, targetTwo] = [randomUUID(), randomUUID()];
  const base = futureBase();
  const [one, two, three] = await insert([
    { user_id: ana.id, action: 'user.password_reset', entity: 'filtro_um', entity_id: targetOne, ip: '198.51.100.71', created_at: new Date(base + 2000) },
    { user_id: bia.id, action: 'user.two_factor_reset', entity: 'filtro_dois', entity_id: targetTwo, ip: '198.51.100.72', created_at: new Date(base + 1000) },
    { user_id: ana.id, action: 'user.two_factor_reset', entity: 'filtro_dois', entity_id: targetTwo, ip: '198.51.100.72', created_at: new Date(base) },
  ]);
  const mine = [one!, two!, three!];
  const cases: Array<[params: Record<string, string>, expected: string[], holds: (item: AuditLogsResponse['items'][number]) => boolean]> = [
    [{ userId: ana.id }, [one!, three!], (item) => item.user?.id === ana.id],
    [{ action: 'user.two_factor_reset' }, [two!, three!], (item) => item.action === 'user.two_factor_reset'],
    [{ entity: 'filtro_dois' }, [two!, three!], (item) => item.entity === 'filtro_dois'],
    [{ entityId: targetOne }, [one!], (item) => item.entityId === targetOne],
    [{ ip: '198.51.100.72' }, [two!, three!], (item) => item.ip === '198.51.100.72'],
    [
      { userId: ana.id, action: 'user.two_factor_reset' },
      [three!],
      (item) => item.user?.id === ana.id && item.action === 'user.two_factor_reset',
    ],
  ];
  expect(cases).toHaveLength(6);

  for (const [params, expected, holds] of cases) {
    const { items } = await list(params);

    expect(items.length, JSON.stringify(params)).toBeGreaterThanOrEqual(expected.length);
    expect(items.filter((item) => !holds(item)), JSON.stringify(params)).toEqual([]);
    expect(items.map((item) => item.id).filter((id) => mine.includes(id)), JSON.stringify(params)).toEqual(expected);
  }
});

test('period_includes_from_and_excludes_to', async () => {
  const from = new Date('2031-03-10T12:00:00.000Z');
  const to = new Date('2031-03-11T12:00:00.000Z');
  const [atFrom, beforeFrom, beforeTo, atTo] = await insert([
    { entity: 'periodo', created_at: from },
    { entity: 'periodo', created_at: new Date(from.getTime() - 1) },
    { entity: 'periodo', created_at: new Date(to.getTime() - 1) },
    { entity: 'periodo', created_at: to },
  ]);
  const ids = async (params: Record<string, string>) =>
    (await list({ entity: 'periodo', ...params })).items.map((item) => item.id);

  // da mais recente para a mais antiga
  expect(await ids({ from: from.toISOString() })).toEqual([atTo, beforeTo, atFrom]);
  expect(await ids({ to: to.toISOString() })).toEqual([beforeTo, atFrom, beforeFrom]);
  expect(await ids({ from: from.toISOString(), to: to.toISOString() })).toEqual([beforeTo, atFrom]);
});

test('seven_invalid_query_parameters_422_on_path', async () => {
  const cases: Array<[param: string, value: string]> = [
    ['userId', 'abc'],
    ['entityId', 'abc'],
    ['action', 'user.deleted'],
    ['from', '2026-10-04T10:00:00'],
    ['to', 'ontem'],
    ['ip', '1'.repeat(46)],
    ['cursor', 'xyz'],
  ];
  expect(cases).toHaveLength(7);

  for (const [param, value] of cases) {
    const response = await admin.get(`/api/audit-logs?${new URLSearchParams({ [param]: value })}`);
    const body = await problem(response);

    expect(response.status, param).toBe(422);
    expect(body.code, param).toBe('validation_failed');
    expect(body.errors?.map((error) => error.path), param).toEqual([param]);
  }

  const longest = await admin.get(`/api/audit-logs?${new URLSearchParams({ ip: '1'.repeat(45) })}`);
  expect(longest.status).toBe(200);
});

test('cursor_the_api_never_issued_is_422', async () => {
  const response = await admin.get(`/api/audit-logs?cursor=${randomUUID()}`);
  const body = await problem(response);

  expect(response.status).toBe(422);
  expect(body.errors?.map((error) => error.path)).toEqual(['cursor']);
});

test('reading_the_trail_writes_no_row', async () => {
  const before = await auditCount(stack);

  const response = await admin.get('/api/audit-logs');

  expect(response.status).toBe(200);
  expect(await auditCount(stack)).toBe(before);
});
