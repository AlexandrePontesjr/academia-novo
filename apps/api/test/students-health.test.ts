import type { Problem, Role, Student } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { DATA_ENCRYPTION_KEY } from './support/app.ts';
import { withAuditInsertFailing } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { captureOutput } from './support/log.ts';
import { type Stack, startStack } from './support/stack.ts';
import { createStudent, maskCpf, studentBody, studentRow, studentRowText } from './support/students.ts';

let stack: Stack;
let reception: Client;
let counter = 2000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  reception = (await stack.session('reception')).client;
}, 180_000);

afterEach(() => vi.restoreAllMocks());
afterAll(() => stack?.close());

const HEALTH = 'Hipertensão controlada, usa losartana. Evitar saltos 🏃';

/** O valor que o banco guarda para a observação: a única coluna da linha que começa por `v1.`. */
async function storedHealth(id: string) {
  const row = (await studentRow(stack, id))!;
  const stored = Object.values(row).filter((value): value is string => typeof value === 'string' && value.startsWith('v1.'));
  expect(stored, 'uma coluna cifrada').toHaveLength(1);
  return stored[0]!;
}

test('health_notes_stored_as_v1_on_create_and_patch', async () => {
  const created = await createStudent(reception, studentBody(next(), { healthNotes: HEALTH }));
  const createdStored = await storedHealth(created.id);
  expect(await studentRowText(stack, created.id)).not.toContain('losartana');
  expect(createdStored.startsWith('v1.')).toBe(true);

  const other = await createStudent(reception, studentBody(next()));
  const edited = await reception.patch(`/api/students/${other.id}`, { healthNotes: 'Asma leve; leva bombinha.' });
  expect(edited.status).toBe(200);
  const editedStored = await storedHealth(other.id);

  expect(editedStored.startsWith('v1.')).toBe(true);
  expect(await studentRowText(stack, other.id)).not.toContain('bombinha');
});

test('same_text_two_students_two_stored_values', async () => {
  const first = await createStudent(reception, studentBody(next(), { healthNotes: HEALTH }));
  const second = await createStudent(reception, studentBody(next(), { healthNotes: HEALTH }));

  expect(await storedHealth(first.id)).not.toBe(await storedHealth(second.id));
});

test('health_notes_read_back_exactly_by_admin_and_reception', async () => {
  const texts = [
    'Operada do joelho em 2023: não correr, só bicicleta.',
    'Alergia a dipirona 💊\nsegunda linha\n\nterceira, com acento: ação',
    `${'á'.repeat(1990)}-fim-xxxxx`,
  ];
  expect(texts[2]).toHaveLength(2000);

  for (const role of ['admin', 'reception'] as Role[]) {
    const { client } = await stack.session(role);
    for (const text of texts) {
      const created = await createStudent(reception, studentBody(next(), { healthNotes: text }));

      const response = await client.get(`/api/students/${created.id}`);

      expect(response.status, role).toBe(200);
      expect(((await response.json()) as Student).healthNotes, role).toBe(text);
    }
  }
});

test('unreadable_stored_value_500_without_student_fields', async () => {
  const mine = await createStudent(reception, studentBody(next(), { healthNotes: HEALTH }));
  const theirs = await createStudent(reception, studentBody(next(), { healthNotes: 'Outro aluno, outro texto.' }));
  const original = await storedHealth(mine.id);
  const others = await storedHealth(theirs.id);
  // o último caractere da tag carrega bits de dado: trocá-lo por um de bits diferentes altera a tag
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = original.at(-1)!;
  const flipped = alphabet[alphabet.indexOf(last) ^ 32]!;
  const cases: Array<[name: string, value: string]> = [
    ['tag alterada', `${original.slice(0, -1)}${flipped}`],
    ['valor de outro aluno', others],
    ['sem prefixo', original.slice('v1.'.length)],
  ];
  const { client: hrFinance } = await stack.session('hr_finance');
  const { client: admin } = await stack.session('admin');

  for (const [name, value] of cases) {
    await stack.query('update students set health_notes_enc = $2 where id = $1', [mine.id, value]);

    for (const role of ['admin', 'reception'] as Role[]) {
      const client = role === 'admin' ? admin : reception;
      const response = await client.get(`/api/students/${mine.id}`);
      const body = (await response.json()) as Problem & Record<string, unknown>;

      expect(response.status, `${name} ${role}`).toBe(500);
      expect(body.code, `${name} ${role}`).toBe('internal_error');
      for (const key of ['name', 'cpf', 'phone', 'birthDate', 'email', 'healthNotes', 'id']) {
        expect(body, `${name} ${role} ${key}`).not.toHaveProperty(key);
      }
      expect(JSON.stringify(body), `${name} ${role}`).not.toContain(mine.name);
    }

    const ficha = await hrFinance.get(`/api/students/${mine.id}`);
    expect(ficha.status, `${name} hr_finance`).toBe(200);
    const list = await admin.get('/api/students');
    expect(list.status, `${name} lista`).toBe(200);
  }
});

test('five_values_never_reach_the_log_even_on_failure', async () => {
  const n = next();
  const body = studentBody(n, { healthNotes: 'Observação-secreta-de-saúde-7731' });
  const cpf = body.cpf;
  const searchTerm = 'Zuleiquinha-do-log';
  const output = captureOutput();

  const created = (await (await reception.post('/api/students', body)).json()) as Student;
  await reception.patch(`/api/students/${created.id}`, { healthNotes: 'Segunda-observação-secreta-8842', name: searchTerm });
  await reception.get(`/api/students/${created.id}`);
  const searched = await reception.get(`/api/students?q=${encodeURIComponent(maskCpf(cpf))}`);
  await reception.get(`/api/students?q=${searchTerm}`);
  await reception.get(`/api/students?q=${cpf}`);
  await reception.delete(`/api/students/${created.id}`);
  const failing = await withAuditInsertFailing(stack, () =>
    reception.post('/api/students', studentBody(next(), { healthNotes: 'Terceira-secreta-9953', cpf: '123.456.789-09' })),
  );
  const written = output.text();
  vi.restoreAllMocks();

  expect(searched.status).toBe(200);
  expect(failing.status).toBe(500);
  expect(written).toMatch(/"msg":"request"/);
  const stored = await storedHealth(created.id);
  const secrets: Record<string, string> = {
    'texto de saúde': 'Observação-secreta-de-saúde-7731',
    'segunda observação': 'Segunda-observação-secreta-8842',
    'terceira observação': 'Terceira-secreta-9953',
    'valor cifrado': stored,
    'parte do valor cifrado': stored.split('.')[2]!,
    chave: DATA_ENCRYPTION_KEY,
    'CPF em dígitos': cpf,
    'CPF mascarado': maskCpf(cpf),
    'CPF da falha': '12345678909',
    'q de CPF': maskCpf(cpf),
    'q de nome': searchTerm,
  };
  for (const [name, value] of Object.entries(secrets)) {
    expect(written.includes(value), `${name} no log`).toBe(false);
  }
});
