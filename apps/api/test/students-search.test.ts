import type { Problem, Role, StudentsResponse } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Client } from './support/client.ts';
import { type Stack, startStack } from './support/stack.ts';
import { cpfOf, insertStudents } from './support/students.ts';

let stack: Stack;
const sessions = {} as Record<Role, Client>;

beforeAll(async () => {
  stack = await startStack();
  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] as Role[]) {
    sessions[role] = (await stack.session(role)).client;
  }
}, 180_000);

afterAll(() => stack?.close());

let counter = 4000;
const cpfs = () => cpfOf((counter += 1));
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const byFoldedNameThenId = (a: { name: string; id: string }, b: { name: string; id: string }) => {
  const [x, y] = [fold(a.name), fold(b.name)];
  return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

async function search(role: Role, query: Record<string, string> = {}) {
  const response = await sessions[role].get(`/api/students?${new URLSearchParams(query)}`);
  expect(response.status, JSON.stringify(query)).toBe(200);
  return (await response.json()) as StudentsResponse;
}

const namesOf = (page: StudentsResponse) => page.items.map((item) => item.name);

/** Esvazia a tabela: cada teste monta o conjunto de que precisa. */
const clear = () => stack.query('delete from students');

test('list_50_sorted_by_folded_name_then_id', async () => {
  await clear();
  const pool = [
    'Álvaro Lima',
    'álvaro Lima Neto',
    'Ângela Rocha',
    'ana souza',
    'Ana Souza Dias',
    'ANA PAULA',
    'Bruno Alves',
    'bruno alves',
    'Cláudia Reis',
    'Conceição Melo',
    'Érica Prado',
    'erica Prado Filho',
    'Fábio Neves',
    'Gabriela Çavuş',
    'Hélio Duarte',
    'Íris Moura',
    'João da Silva',
    'Joana Souza',
    'Lúcia Ñandu',
    'Márcio Tavares',
    'Nádia Pires',
    'Óscar Brito',
    'Patrícia Zanin',
    'Úrsula Gomes',
    'Zeca Pagodinho',
  ];
  const names = [...pool, ...pool.slice(0, 5), ...Array.from({ length: 25 }, (_, index) => `Zélia ${String(index).padStart(2, '0')}`)];
  expect(names).toHaveLength(55);
  const statuses = ['active', 'inactive', 'suspended'];
  const ids = await insertStudents(
    stack,
    names.map((name, index) => ({ name, cpf: cpfs(), status: statuses[index % 3]!, phone: '21988887777' })),
  );
  const expected = names
    .map((name, index) => ({ name, id: ids[index]! }))
    .sort(byFoldedNameThenId)
    .slice(0, 50);

  for (const role of ['admin', 'reception', 'hr_finance'] as Role[]) {
    const page = await search(role);

    expect(page.items, role).toHaveLength(50);
    for (const item of page.items) expect(Object.keys(item).sort(), role).toEqual(['cpf', 'id', 'name', 'phone', 'status']);
    expect(page.items.map(({ id, name }) => ({ id, name })), role).toEqual(expected);
    expect(page.nextCursor, role).not.toBeNull();
  }
});

test('list_instructor_three_keys_per_item', async () => {
  const page = await search('instructor');

  expect(page.items.length).toBeGreaterThan(0);
  for (const item of page.items) expect(Object.keys(item).sort()).toEqual(['id', 'name', 'status']);
});

test('name_terms_fold_case_and_accents', async () => {
  await clear();
  await insertStudents(stack, [
    { name: 'João da Silva', cpf: cpfs(), phone: '21988887777' },
    { name: 'Joana Souza', cpf: cpfs(), phone: '21988887776' },
    { name: 'Pedro Alves', cpf: cpfs(), phone: '11912345678' },
  ]);
  const cases: Array<[q: string, expected: string[]]> = [
    ['joao silva', ['João da Silva']],
    ['SILVA JOAO', ['João da Silva']],
    ['joão', ['João da Silva']],
    ['silva zzz', []],
    ['11 joao', []],
  ];

  for (const role of ['reception', 'instructor'] as Role[]) {
    for (const [q, expected] of cases) {
      expect(namesOf(await search(role, { q })), `${role} q=${q}`).toEqual(expected);
    }
  }
});

test('digits_match_cpf_equal_or_phone_contains', async () => {
  await clear();
  const [id] = await insertStudents(stack, [
    { name: 'Rita Cardoso', cpf: '52998224725', phone: '11912345678' },
    { name: 'Outro Aluno', cpf: cpfs(), phone: '21988887777' },
    { name: 'Mais Um', cpf: cpfs(), phone: '21988887776' },
  ]);
  const found = ['529.982.247-25', '11912345678', '(11) 91234-5678', '91234'];

  for (const role of ['admin', 'reception', 'hr_finance'] as Role[]) {
    for (const q of found) {
      expect((await search(role, { q })).items.map((item) => item.id), `${role} q=${q}`).toEqual([id]);
    }
    expect((await search(role, { q: '5299822' })).items, `${role} q=5299822`).toEqual([]);
  }
});

test('instructor_digit_query_empty_without_comparing', async () => {
  await clear();
  const [id] = await insertStudents(stack, [{ name: 'Rita Cardoso', cpf: '52998224725', phone: '11912345678' }]);

  for (const q of ['529.982.247-25', '11912345678']) {
    expect((await search('instructor', { q })).items, `instrutor q=${q}`).toEqual([]);
    expect((await search('reception', { q })).items.map((item) => item.id), `recepção q=${q}`).toEqual([id]);
  }
});

test('status_filter_alone_and_with_q', async () => {
  await clear();
  await insertStudents(stack, [
    { name: 'Ana Silva', cpf: cpfs(), status: 'active' },
    { name: 'Bia Silva', cpf: cpfs(), status: 'inactive' },
    { name: 'Caio Silva', cpf: cpfs(), status: 'suspended' },
    { name: 'Davi Souza', cpf: cpfs(), status: 'inactive' },
    { name: 'Edu Souza', cpf: cpfs(), status: 'active' },
  ]);

  expect(namesOf(await search('reception', { status: 'active' }))).toEqual(['Ana Silva', 'Edu Souza']);
  expect(namesOf(await search('reception', { status: 'inactive' }))).toEqual(['Bia Silva', 'Davi Souza']);
  expect(namesOf(await search('reception', { status: 'suspended' }))).toEqual(['Caio Silva']);
  expect(namesOf(await search('reception', { q: 'silva', status: 'inactive' }))).toEqual(['Bia Silva']);
});

test('cursor_walks_every_student_once_with_equal_names', async () => {
  await clear();
  const names = Array.from({ length: 120 }, (_, index) => (index < 40 ? 'Maria Souza' : `Pessoa ${String(index).padStart(3, '0')}`));
  const statuses = ['active', 'inactive', 'suspended'];
  const ids = await insertStudents(
    stack,
    names.map((name, index) => ({ name, cpf: cpfs(), status: statuses[index % 3]!, phone: '21988887777' })),
  );
  const all = names.map((name, index) => ({ name, id: ids[index]!, status: statuses[index % 3]! })).sort(byFoldedNameThenId);

  async function walk(query: Record<string, string>) {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: StudentsResponse = await search('reception', cursor ? { ...query, cursor } : query);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    return seen;
  }

  expect(await walk({})).toEqual(all.map((student) => student.id));
  expect(await walk({ status: 'active' })).toEqual(all.filter((student) => student.status === 'active').map((student) => student.id));
  expect(await walk({ q: 'maria' })).toEqual(all.filter((student) => student.name === 'Maria Souza').map((student) => student.id));
  expect(await walk({ q: 'maria', status: 'suspended' })).toEqual(
    all.filter((student) => student.name === 'Maria Souza' && student.status === 'suspended').map((student) => student.id),
  );
});

test('next_cursor_null_at_50_and_set_at_51', async () => {
  await clear();
  await insertStudents(
    stack,
    Array.from({ length: 50 }, (_, index) => ({ name: `Lote ${String(index).padStart(3, '0')}`, cpf: cpfs() })),
  );

  const exactly = await search('reception', { q: 'lote' });
  expect(exactly.items).toHaveLength(50);
  expect(exactly.nextCursor).toBeNull();

  await insertStudents(stack, [{ name: 'Lote 050', cpf: cpfs() }]);

  const more = await search('reception', { q: 'lote' });
  expect(more.items).toHaveLength(50);
  expect(more.nextCursor).not.toBeNull();
  const last = await search('reception', { q: 'lote', cursor: more.nextCursor! });
  expect(namesOf(last)).toEqual(['Lote 050']);
  expect(last.nextCursor).toBeNull();
});

test('six_invalid_query_parameters_422_on_path', async () => {
  const base64url = (text: string) => Buffer.from(text).toString('base64url');
  const cases: Array<[param: string, query: Record<string, string>]> = [
    ['status', { status: 'archived' }],
    ['q', { q: '' }],
    ['q', { q: 'a'.repeat(101) }],
    ['cursor', { cursor: 'xyz' }],
    ['cursor', { cursor: base64url('isto nao e json') }],
    ['cursor', { cursor: base64url(JSON.stringify({ a: 1 })) }],
  ];
  expect(cases).toHaveLength(6);

  for (const [param, query] of cases) {
    const response = await sessions.reception.get(`/api/students?${new URLSearchParams(query)}`);
    const body = (await response.json()) as Problem;

    expect(response.status, JSON.stringify(query).slice(0, 40)).toBe(422);
    expect(body.code).toBe('validation_failed');
    expect(body.errors?.map((error) => error.path)).toEqual([param]);
  }

  expect((await search('reception', { q: 'a'.repeat(100) })).items).toEqual([]);
});
