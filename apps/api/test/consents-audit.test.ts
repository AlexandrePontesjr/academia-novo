import { request } from 'node:http';
import type { Consent, Role, Student } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { WEB_ORIGIN } from './support/app.ts';
import { type AuditRow, auditCount, auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  createAdult,
  createMinorWithGuardian,
  guardianBody,
  insertTerm,
  minorBirthDate,
  termText,
} from './support/consents.ts';
import { captureOutput } from './support/log.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { studentBody, unknownId } from './support/students.ts';

let stack: Stack;
let reception: Client;
let counter = 7000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  reception = (await stack.session('reception')).client;
}, 180_000);

afterEach(() => vi.restoreAllMocks());
afterAll(() => stack?.close());

const grant = (client: Client, studentId: string, body: Record<string, unknown>) =>
  client.post(`/api/students/${studentId}/consents`, body);
const image = (grantedBy: string) => ({ purpose: 'image_use', termVersion: 1, grantedBy });
const data = (grantedBy: string) => ({ purpose: 'data_processing', termVersion: 1, grantedBy });
const revoke = (client: Client, studentId: string, consentId: string) =>
  client.delete(`/api/students/${studentId}/consents/${consentId}`);

/** Cada linha de `rows` é do autor e do aluno dados, e as ações são exatamente `actions`. */
function expectActs(label: string, rows: AuditRow[], userId: string, studentId: string, actions: string[]) {
  expect(rows.map((row) => row.action).sort(), label).toEqual([...actions].sort());
  for (const row of rows) {
    expect(row.user_id, `${label} ${row.action}`).toBe(userId);
    expect(row.entity, `${label} ${row.action}`).toBe('student');
    expect(row.entity_id, `${label} ${row.action}`).toBe(studentId);
  }
}

test('one_audit_row_per_act_with_actor_and_student_target', async () => {
  for (const role of ['admin', 'reception'] as Role[]) {
    const { user, client } = await stack.session(role);

    const created = await written(stack, () =>
      client.post('/api/students', studentBody(next(), { birthDate: minorBirthDate(), guardian: guardianBody() })),
    );
    const student = (await created.result.json()) as Student;
    expectActs(`${role} POST com responsável`, created.rows, user.id, student.id, [
      'student.created',
      'student.guardian_saved',
    ]);

    const swapped = await written(stack, () =>
      client.patch(`/api/students/${student.id}`, { guardian: guardianBody({ phone: '(11) 98888-7777' }) }),
    );
    expect(swapped.result.status, role).toBe(200);
    expectActs(`${role} PATCH com responsável novo`, swapped.rows, user.id, student.id, ['student.guardian_saved']);

    const granted = await written(stack, () => grant(client, student.id, image('guardian')));
    const consent = (await granted.result.json()) as Consent;
    expectActs(`${role} concessão`, granted.rows, user.id, student.id, ['student.consent_granted']);

    const revoked = await written(stack, () => revoke(client, student.id, consent.id));
    expect(revoked.result.status, role).toBe(204);
    expectActs(`${role} revogação`, revoked.rows, user.id, student.id, ['student.consent_revoked']);

    const both = await written(stack, () =>
      client.patch(`/api/students/${student.id}`, {
        phone: '11977776666',
        guardian: guardianBody({ phone: '(11) 97777-6666' }),
      }),
    );
    expect(both.result.status, role).toBe(200);
    expectActs(`${role} PATCH do telefone e do responsável`, both.rows, user.id, student.id, [
      'student.updated',
      'student.guardian_saved',
    ]);
  }
});

test('diff_of_guardian_saved_on_create_names_four_fields_only', async () => {
  const { rows } = await written(stack, () =>
    reception.post('/api/students', studentBody(next(), { birthDate: minorBirthDate(), guardian: guardianBody() })),
  );

  const saved = rows.find((row) => row.action === 'student.guardian_saved')!;
  expect(saved.diff).toEqual({ fields: ['name', 'cpf', 'phone', 'relationship'], values: {} });
});

test('diff_of_guardian_saved_on_patch_names_the_changed_field', async () => {
  const minor = await createMinorWithGuardian(reception, next());

  const { rows } = await written(stack, () =>
    reception.patch(`/api/students/${minor.id}`, { guardian: guardianBody({ phone: '(11) 98888-7777' }) }),
  );

  expect(rows).toHaveLength(1);
  expect(rows[0]!.diff).toEqual({ fields: ['phone'], values: {} });
});

test('diff_of_consent_granted_has_null_from', async () => {
  const minor = await createMinorWithGuardian(reception, next());
  const adult = await createAdult(reception, next());

  const byGuardian = await written(stack, () => grant(reception, minor.id, image('guardian')));
  const byStudent = await written(stack, () => grant(reception, adult.id, data('student')));

  expect(byGuardian.rows[0]!.diff).toEqual({
    fields: ['purpose', 'termVersion', 'grantedBy'],
    values: {
      purpose: { from: null, to: 'image_use' },
      termVersion: { from: null, to: 1 },
      grantedBy: { from: null, to: 'guardian' },
    },
  });
  expect(byStudent.rows[0]!.diff).toEqual({
    fields: ['purpose', 'termVersion', 'grantedBy'],
    values: {
      purpose: { from: null, to: 'data_processing' },
      termVersion: { from: null, to: 1 },
      grantedBy: { from: null, to: 'student' },
    },
  });
});

test('diff_of_consent_revoked_has_null_to', async () => {
  const minor = await createMinorWithGuardian(reception, next());
  const adult = await createAdult(reception, next());
  const byGuardian = (await (await grant(reception, minor.id, image('guardian'))).json()) as Consent;
  const byStudent = (await (await grant(reception, adult.id, data('student'))).json()) as Consent;

  const first = await written(stack, () => revoke(reception, minor.id, byGuardian.id));
  const second = await written(stack, () => revoke(reception, adult.id, byStudent.id));

  expect(first.rows[0]!.diff).toEqual({
    fields: ['purpose', 'termVersion', 'grantedBy'],
    values: {
      purpose: { from: 'image_use', to: null },
      termVersion: { from: 1, to: null },
      grantedBy: { from: 'guardian', to: null },
    },
  });
  expect(second.rows[0]!.diff).toEqual({
    fields: ['purpose', 'termVersion', 'grantedBy'],
    values: {
      purpose: { from: 'data_processing', to: null },
      termVersion: { from: 1, to: null },
      grantedBy: { from: 'student', to: null },
    },
  });
});

test('rejected_consent_requests_write_no_row', async () => {
  // a versão antiga só existe num banco com a versão 2
  const own = await startStack();
  try {
    await insertTerm(own, 'data_processing', 2);
    const anonymous = own.client();
    const clerk = (await own.session('reception')).client;
    const finance = (await own.session('hr_finance')).client;
    const target = await createAdult(clerk, next());
    const active = await createAdult(clerk, next());
    expect((await grant(clerk, active.id, image('student'))).status).toBe(201);
    const revoked = await createAdult(clerk, next());
    const revokedConsent = (await (await grant(clerk, revoked.id, image('student'))).json()) as Consent;
    expect((await revoke(clerk, revoked.id, revokedConsent.id)).status).toBe(204);
    const taken = await createAdult(clerk, next());

    const cases: Array<[label: string, status: number, code: string | undefined, send: () => Promise<Response>]> = [
      ['POST sem cookie', 401, 'unauthorized', () => grant(anonymous, target.id, image('student'))],
      ['POST de hr_finance', 403, 'forbidden', () => grant(finance, target.id, image('student'))],
      ['POST de aluno que não existe', 404, 'not_found', () => grant(clerk, unknownId(), image('student'))],
      ['POST com consentimento ativo', 409, 'consent_active', () => grant(clerk, active.id, image('student'))],
      ['POST com versão antiga', 409, 'consent_term_outdated', () => grant(clerk, target.id, data('student'))],
      ['POST com grantedBy staff', 422, undefined, () => grant(clerk, target.id, image('staff'))],
      ['DELETE de consentimento que não existe', 404, 'not_found', () => revoke(clerk, target.id, unknownId())],
      ['DELETE de consentimento já revogado', 204, undefined, () => revoke(clerk, revoked.id, revokedConsent.id)],
      [
        'POST /api/students de menor sem guardian',
        422,
        undefined,
        () => clerk.post('/api/students', studentBody(next(), { birthDate: minorBirthDate() })),
      ],
      [
        'POST /api/students com guardian e CPF repetido',
        409,
        'cpf_taken',
        () => clerk.post('/api/students', studentBody(next(), { cpf: taken.cpf, guardian: guardianBody() })),
      ],
      ['PATCH com guardian nulo', 422, undefined, () => clerk.patch(`/api/students/${target.id}`, { guardian: null })],
    ];
    expect(cases).toHaveLength(11);

    for (const [label, status, code, send] of cases) {
      const before = await auditCount(own);

      const response = await send();

      expect(response.status, label).toBe(status);
      if (code) expect((await problem(response)).code, label).toBe(code);
      expect(await auditCount(own), label).toBe(before);
    }
  } finally {
    await own.close();
  }
});

/** Tudo o que as três tabelas guardam, como texto, para a comparação "ficaram idênticos". */
async function snapshot() {
  const all = async (table: string) =>
    (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by id`)).map((entry) => entry.row);
  return { students: await all('students'), guardians: await all('guardians'), consents: await all('consents') };
}

test('audit_insert_failure_rolls_back_four_routes', async () => {
  const minor = await createMinorWithGuardian(reception, next());
  const adult = await createAdult(reception, next());
  const consent = (await (await grant(reception, adult.id, image('student'))).json()) as Consent;
  const routes: Array<[string, () => Promise<Response>]> = [
    [
      'POST /api/students com guardian',
      () => reception.post('/api/students', studentBody(next(), { birthDate: minorBirthDate(), guardian: guardianBody() })),
    ],
    [
      'PATCH com guardian novo',
      () => reception.patch(`/api/students/${minor.id}`, { guardian: guardianBody({ phone: '(11) 98888-7777' }) }),
    ],
    ['POST de consentimento', () => grant(reception, minor.id, data('guardian'))],
    ['DELETE de consentimento', () => revoke(reception, adult.id, consent.id)],
  ];

  for (const [label, send] of routes) {
    const before = await snapshot();

    const response = await withAuditInsertFailing(stack, send);

    expect(response.status, label).toBe(500);
    expect((await problem(response)).code, label).toBe('internal_error');
    expect(await snapshot(), label).toEqual(before);
  }
  // o consentimento do DELETE continua ativo
  const [row] = await stack.query<{ revoked_at: Date | null }>('select revoked_at from consents where id = $1', [consent.id]);
  expect(row!.revoked_at).toBeNull();
});

/** Percorre as quatro operações e devolve o que elas deixaram. Nomes e CPFs distintos nas duas versões do responsável. */
async function walkGuardianAndConsent() {
  const first = guardianBody({ name: 'Ana Souza', cpf: '529.982.247-25', phone: '(11) 91234-5678' });
  const swapped = guardianBody({ name: 'Beatriz Lima Souza', cpf: '123.456.789-09', phone: '(21) 98765-4321' });
  const created = await reception.post('/api/students', studentBody(next(), { birthDate: minorBirthDate(), guardian: first }));
  const student = (await created.json()) as Student;
  expect(created.status).toBe(201);
  expect((await reception.patch(`/api/students/${student.id}`, { guardian: swapped })).status).toBe(200);
  const granted = await grant(reception, student.id, image('guardian'));
  expect(granted.status).toBe(201);
  const consent = (await granted.json()) as Consent;
  expect((await revoke(reception, student.id, consent.id)).status).toBe(204);
  return { student, first, swapped };
}

/** Os sete valores que nunca podem chegar à trilha nem ao log; cada entrada lista as formas em que ele pode aparecer. */
async function forbiddenValues() {
  const asJson = (text: string) => JSON.stringify(text).slice(1, -1);
  const firstLine = (text: string) => text.split('\n')[0]!;
  const dataTerm = await termText(stack, 'data_processing', 1);
  const imageTerm = await termText(stack, 'image_use', 1);
  return {
    'nome do responsável (o primeiro e o trocado)': ['Ana Souza', 'Beatriz Lima Souza'],
    'CPF em dígitos': ['52998224725', '12345678909'],
    'CPF mascarado': ['529.982.247-25', '123.456.789-09'],
    'telefone em dígitos': ['11912345678', '21987654321'],
    'telefone como digitado': ['(11) 91234-5678', '(21) 98765-4321'],
    'texto do termo de data_processing': [dataTerm, asJson(dataTerm), firstLine(dataTerm)],
    'texto do termo de image_use': [imageTerm, asJson(imageTerm), firstLine(imageTerm)],
  };
}

test('seven_guardian_and_term_values_never_reach_audit_logs', async () => {
  await walkGuardianAndConsent();

  const logs = (await stack.query<{ row: string }>('select to_jsonb(a)::text as row from audit_logs a')).map((entry) => entry.row);
  const everything = logs.join('\n');
  expect(logs.length).toBeGreaterThan(0);
  const forbidden = Object.entries(await forbiddenValues());
  expect(forbidden).toHaveLength(7);

  for (const [label, forms] of forbidden) {
    for (const form of forms) expect(everything.includes(form), `${label}: ${form.slice(0, 30)}`).toBe(false);
  }
});

test('ip_and_user_agent_on_the_three_consent_actions', async () => {
  const { client } = await stack.session('reception');
  const longAgent = 'a'.repeat(513);
  const forwarded = '198.51.100.1, 203.0.113.7';

  /** A requisição pelo `node:http`, que não acrescenta `User-Agent` nem mexe nos cabeçalhos dados. */
  const send = (method: string, path: string, body: unknown, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = request(
        `${stack.api.url}${path}`,
        {
          method,
          headers: {
            Origin: WEB_ORIGIN,
            Cookie: client.cookie(),
            ...(payload !== undefined && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
            ...headers,
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        },
      );
      req.on('error', reject);
      req.end(payload);
    });

  for (const withAgent of [true, false]) {
    const headers: Record<string, string> = { 'X-Forwarded-For': forwarded, ...(withAgent ? { 'User-Agent': longAgent } : {}) };
    const student = await createAdult(reception, next());
    const before = new Set((await auditRows(stack)).map((row) => row.id));

    const saved = await send('PATCH', `/api/students/${student.id}`, { guardian: guardianBody() }, headers);
    const granted = await send('POST', `/api/students/${student.id}/consents`, image('student'), headers);
    const [created] = await stack.query<{ id: string }>('select id from consents where student_id = $1', [student.id]);
    const revoked = await send('DELETE', `/api/students/${student.id}/consents/${created!.id}`, undefined, headers);
    expect([saved, granted, revoked], withAgent ? 'com User-Agent' : 'sem User-Agent').toEqual([200, 201, 204]);

    const rows = (await auditRows(stack)).filter((row) => !before.has(row.id));
    expect(rows.map((row) => row.action).sort()).toEqual(
      ['student.consent_granted', 'student.consent_revoked', 'student.guardian_saved'].sort(),
    );
    for (const row of rows) {
      expect(row.ip, row.action).toBe('203.0.113.7');
      expect(row.user_agent, `${row.action} ${withAgent}`).toBe(withAgent ? longAgent.slice(0, 512) : null);
    }
  }
});

test('seven_guardian_and_term_values_never_reach_the_log', async () => {
  const output = captureOutput();

  const { student } = await walkGuardianAndConsent();
  expect((await reception.get(`/api/students/${student.id}/consents`)).status).toBe(200);
  // uma operação cujo insert em `audit_logs` falha também escreve no log
  const failed = await withAuditInsertFailing(stack, () =>
    grant(reception, student.id, data('guardian')),
  );
  expect(failed.status).toBe(500);

  const text = output.text();
  expect(text.length).toBeGreaterThan(0);
  const forbidden = Object.entries(await forbiddenValues());
  expect(forbidden).toHaveLength(7);
  for (const [label, forms] of forbidden) {
    for (const form of forms) expect(text.includes(form), `${label}: ${form.slice(0, 30)}`).toBe(false);
  }
});
