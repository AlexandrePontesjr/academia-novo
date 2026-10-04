import type { Consent, Problem, Role } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  consentCount,
  consentRows,
  createAdult,
  createMinorWithGuardian,
  currentGuardianId,
  guardianBody,
  insertConsent,
  insertLegacyMinor,
  insertTerm,
} from './support/consents.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { fieldErrorPaths, releasedTogether, setStatus, unknownId } from './support/students.ts';

let stack: Stack;
let reception: Client;
let counter = 5000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  reception = (await stack.session('reception')).client;
}, 180_000);

afterAll(() => stack?.close());

const grant = (client: Client, studentId: string, body: Record<string, unknown>) =>
  client.post(`/api/students/${studentId}/consents`, body);
const image = (grantedBy = 'student', extra: Record<string, unknown> = {}) => ({
  purpose: 'image_use',
  termVersion: 1,
  grantedBy,
  ...extra,
});

/** `now()` do banco do teste, no instante da leitura. */
const databaseNow = async (on: Stack = stack) => (await on.query<{ t: Date }>('select now() as t'))[0]!.t;

const parse = (row: string) => JSON.parse(row) as Record<string, unknown>;

test('grant_201_by_student_for_adult_with_database_clock', async () => {
  for (const role of ['admin', 'reception'] as Role[]) {
    const { client } = await stack.session(role);
    const student = await createAdult(client, next());
    const before = await databaseNow();

    const response = await grant(client, student.id, image('student', { grantedAt: '2000-01-01T00:00:00Z' }));
    const after = await databaseNow();
    const consent = (await response.json()) as Consent;

    expect(response.status, role).toBe(201);
    expect(Object.keys(consent).sort(), role).toEqual(
      ['grantedAt', 'grantedBy', 'guardian', 'id', 'purpose', 'revokedAt', 'termVersion'].sort(),
    );
    expect(consent, role).toMatchObject({ purpose: 'image_use', termVersion: 1, grantedBy: 'student', guardian: null, revokedAt: null });
    expect(new Date(consent.grantedAt).getTime(), role).toBeGreaterThanOrEqual(before.getTime());
    expect(new Date(consent.grantedAt).getTime(), role).toBeLessThanOrEqual(after.getTime());
  }
  // o cabeçalho `Date` de 2000 também não é o instante do aceite
  const student = await createAdult(reception, next());
  const before = await databaseNow();
  const response = await reception.post(`/api/students/${student.id}/consents`, image(), {
    headers: { Date: 'Sat, 01 Jan 2000 00:00:00 GMT' },
  });
  const consent = (await response.json()) as Consent;
  expect(response.status).toBe(201);
  expect(new Date(consent.grantedAt).getTime()).toBeGreaterThanOrEqual(before.getTime());
});

test('grant_201_by_guardian_links_the_current_guardian', async () => {
  const minor = await createMinorWithGuardian(reception, next());
  const response = await grant(reception, minor.id, image('guardian'));
  const consent = (await response.json()) as Consent;

  expect(response.status, 'menor').toBe(201);
  const guardianId = await currentGuardianId(stack, minor.id);
  expect(Object.keys(consent.guardian!).sort()).toEqual(['id', 'name']);
  expect(consent.guardian).toEqual({ id: guardianId, name: 'Ana Souza' });
  expect((await consentRows(stack, minor.id)).map(parse)[0]).toMatchObject({ guardian_id: guardianId, granted_by: 'guardian' });

  // adulto que tem responsável gravado
  const adult = await createAdult(reception, next(), { guardian: guardianBody() });
  const adultResponse = await grant(reception, adult.id, image('guardian'));
  expect(adultResponse.status, 'adulto com responsável').toBe(201);
  expect(((await adultResponse.json()) as Consent).guardian?.id).toBe(await currentGuardianId(stack, adult.id));

  // depois de trocar o responsável, a concessão seguinte aponta para o novo
  const swap = await reception.patch(`/api/students/${adult.id}`, { guardian: guardianBody({ phone: '(11) 98888-7777' }) });
  expect(swap.status).toBe(200);
  const second = await grant(reception, adult.id, { purpose: 'data_processing', termVersion: 1, grantedBy: 'guardian' });
  const newest = await currentGuardianId(stack, adult.id);
  expect(second.status).toBe(201);
  expect(((await second.json()) as Consent).guardian?.id).toBe(newest);
  expect(newest).not.toBe(consent.guardian!.id);
});

test('grant_by_student_for_minor_422_on_granted_by', async () => {
  const withGuardian = await createMinorWithGuardian(reception, next());
  const legacy = await insertLegacyMinor(stack, next());
  const total = await consentCount(stack);

  for (const [label, id] of [['com responsável', withGuardian.id], ['sem responsável', legacy]] as const) {
    const response = await grant(reception, id, image('student'));

    expect(response.status, label).toBe(422);
    const errors = ((await response.json()) as Problem).errors ?? [];
    expect(errors, label).toHaveLength(1);
    expect(errors[0]!.path, label).toBe('grantedBy');
  }
  expect(await consentCount(stack)).toBe(total);
});

test('grant_by_guardian_without_guardian_422_on_granted_by', async () => {
  const adult = await createAdult(reception, next());
  const legacy = await insertLegacyMinor(stack, next());
  const total = await consentCount(stack);

  for (const [label, id] of [['adulto sem responsável', adult.id], ['menor legado', legacy]] as const) {
    const response = await grant(reception, id, image('guardian'));

    expect(response.status, label).toBe(422);
    const errors = ((await response.json()) as Problem).errors ?? [];
    expect(errors, label).toHaveLength(1);
    expect(errors[0]!.path, label).toBe('grantedBy');
  }
  expect(await consentCount(stack)).toBe(total);
});

test('grant_invalid_fields_422_on_each_path', async () => {
  const adult = await createAdult(reception, next());
  const total = await consentCount(stack);
  const without = (field: string) => Object.fromEntries(Object.entries(image()).filter(([key]) => key !== field));
  const cases: Array<[label: string, body: Record<string, unknown>, path: string]> = [
    ['purpose marketing', image('student', { purpose: 'marketing' }), 'purpose'],
    ['purpose ausente', without('purpose'), 'purpose'],
    ['termVersion 0', image('student', { termVersion: 0 }), 'termVersion'],
    ['termVersion 1.5', image('student', { termVersion: 1.5 }), 'termVersion'],
    ['termVersion "1"', image('student', { termVersion: '1' }), 'termVersion'],
    ['grantedBy staff', image('staff'), 'grantedBy'],
    ['grantedBy ausente', without('grantedBy'), 'grantedBy'],
  ];

  for (const [label, body, path] of cases) {
    const response = await grant(reception, adult.id, body);

    expect(response.status, label).toBe(422);
    expect(await fieldErrorPaths(response), label).toEqual([path]);
  }
  expect(await consentCount(stack)).toBe(total);
});

test('grant_unknown_term_422_on_term_version', async () => {
  const adult = await createAdult(reception, next());
  const total = await consentCount(stack);

  for (const purpose of ['image_use', 'data_processing']) {
    const response = await grant(reception, adult.id, { purpose, termVersion: 99, grantedBy: 'student' });

    expect(response.status, purpose).toBe(422);
    expect(await fieldErrorPaths(response), purpose).toEqual(['termVersion']);
  }
  expect(await consentCount(stack)).toBe(total);
});

test('grant_outdated_term_409_consent_term_outdated', async () => {
  // o termo é append-only: quem publica a versão 2 sobe o banco dele
  const own = await startStack();
  try {
    await insertTerm(own, 'data_processing', 2);
    const { client } = await own.session('reception');
    const student = await createAdult(client, next());
    const body = (termVersion: number) => ({ purpose: 'data_processing', termVersion, grantedBy: 'student' });

    const outdated = await grant(client, student.id, body(1));
    expect(outdated.status).toBe(409);
    expect((await problem(outdated)).code).toBe('consent_term_outdated');
    expect(await consentCount(own)).toBe(0);

    const current = await grant(client, student.id, body(2));
    expect(current.status).toBe(201);
    expect(await consentCount(own)).toBe(1);
  } finally {
    await own.close();
  }
});

test('grant_with_active_consent_409_consent_active', async () => {
  const own = await startStack();
  try {
    const { client } = await own.session('reception');
    const student = await createAdult(client, next());
    expect((await grant(client, student.id, image())).status).toBe(201);
    const total = await consentCount(own);

    const sameVersion = await grant(client, student.id, image());
    expect(sameVersion.status, 'mesma versão').toBe(409);
    expect((await problem(sameVersion)).code).toBe('consent_active');

    await insertTerm(own, 'image_use', 2);
    const otherVersion = await grant(client, student.id, image('student', { termVersion: 2 }));
    expect(otherVersion.status, 'outra versão').toBe(409);
    expect((await problem(otherVersion)).code).toBe('consent_active');
    expect(await consentCount(own)).toBe(total);

    const otherPurpose = await grant(client, student.id, { purpose: 'data_processing', termVersion: 1, grantedBy: 'student' });
    expect(otherPurpose.status, 'outra finalidade').toBe(201);
  } finally {
    await own.close();
  }
});

test('ten_concurrent_grants_one_201_one_409', async () => {
  for (let round = 0; round < 10; round += 1) {
    const student = await createAdult(reception, next());

    const { result: responses, rows } = await written(stack, () =>
      releasedTogether([() => grant(reception, student.id, image()), () => grant(reception, student.id, image())]),
    );

    expect(responses.map((response) => response.status).sort(), `rodada ${round}`).toEqual([201, 409]);
    const conflict = responses.find((response) => response.status === 409)!;
    expect((await problem(conflict)).code, `rodada ${round}`).toBe('consent_active');
    const active = await stack.query<{ n: string }>(
      "select count(*) as n from consents where student_id = $1 and purpose = 'image_use' and revoked_at is null",
      [student.id],
    );
    expect(Number(active[0]!.n), `rodada ${round}`).toBe(1);
    expect(rows.filter((row) => row.action === 'student.consent_granted'), `rodada ${round}`).toHaveLength(1);
  }
});

test('revoke_204_keeps_row_and_sets_revoked_at', async () => {
  for (const role of ['admin', 'reception'] as Role[]) {
    const { client } = await stack.session(role);
    const student = await createAdult(client, next());
    const created = (await (await grant(client, student.id, image())).json()) as Consent;
    const total = await consentCount(stack);
    const [rowBefore] = (await consentRows(stack, student.id)).map(parse);
    const before = await databaseNow();

    const response = await client.delete(`/api/students/${student.id}/consents/${created.id}`);
    const after = await databaseNow();

    expect(response.status, role).toBe(204);
    expect(await response.text(), role).toBe('');
    expect(await consentCount(stack), role).toBe(total);
    const [rowAfter] = (await consentRows(stack, student.id)).map(parse);
    const revokedAt = new Date(rowAfter!.revoked_at as string);
    expect(revokedAt.getTime(), role).toBeGreaterThanOrEqual(before.getTime());
    expect(revokedAt.getTime(), role).toBeLessThanOrEqual(after.getTime());
    // todas as colunas menos `revoked_at`, a única que muda
    expect({ ...rowAfter, revoked_at: null }, role).toEqual({ ...rowBefore, revoked_at: null });
  }
});

test('revoke_of_revoked_204_changes_nothing', async () => {
  const student = await createAdult(reception, next());
  const created = (await (await grant(reception, student.id, image())).json()) as Consent;
  expect((await reception.delete(`/api/students/${student.id}/consents/${created.id}`)).status).toBe(204);
  const [revoked] = await consentRows(stack, student.id);
  const logs = await auditCount(stack);

  const again = await reception.delete(`/api/students/${student.id}/consents/${created.id}`);

  expect(again.status).toBe(204);
  expect((await consentRows(stack, student.id))[0]).toBe(revoked);
  expect(await auditCount(stack)).toBe(logs);
});

test('grant_after_revoke_inserts_another_row', async () => {
  const student = await createAdult(reception, next());
  const created = (await (await grant(reception, student.id, image())).json()) as Consent;
  await reception.delete(`/api/students/${student.id}/consents/${created.id}`);
  const total = await consentCount(stack);
  const [revoked] = await consentRows(stack, student.id);

  const response = await grant(reception, student.id, image());

  expect(response.status).toBe(201);
  expect(await consentCount(stack)).toBe(total + 1);
  const rows = (await consentRows(stack, student.id)).map(parse);
  expect(rows).toHaveLength(2);
  expect(rows.filter((row) => row.revoked_at === null)).toHaveLength(1);
  expect(rows.find((row) => row.revoked_at !== null)).toEqual(parse(revoked!));
});

test('consent_routes_404_for_nine_bad_ids', async () => {
  const student = await createAdult(reception, next());
  const other = await createAdult(reception, next());
  const othersConsent = (await (await grant(reception, other.id, image())).json()) as Consent;
  const own = (id: string) => `/api/students/${id}/consents`;
  const cases: Array<[label: string, send: () => Promise<Response>]> = [
    ['GET :id abc', () => reception.get(own('abc'))],
    ['GET :id sem aluno', () => reception.get(own(unknownId()))],
    ['POST :id abc', () => grant(reception, 'abc', image())],
    ['POST :id sem aluno', () => grant(reception, unknownId(), image())],
    ['DELETE :id abc', () => reception.delete(`${own('abc')}/${unknownId()}`)],
    ['DELETE :id sem aluno', () => reception.delete(`${own(unknownId())}/${unknownId()}`)],
    ['DELETE :consentId abc', () => reception.delete(`${own(student.id)}/abc`)],
    ['DELETE :consentId sem consentimento', () => reception.delete(`${own(student.id)}/${unknownId()}`)],
    ['DELETE :consentId de outro aluno', () => reception.delete(`${own(student.id)}/${othersConsent.id}`)],
  ];
  expect(cases).toHaveLength(9);

  for (const [label, send] of cases) {
    const response = await send();

    expect(response.status, label).toBe(404);
    expect((await problem(response)).code, label).toBe('not_found');
  }
  // o consentimento de outro aluno continua ativo
  expect((await consentRows(stack, other.id)).map(parse)[0]!.revoked_at).toBeNull();
});

test('grant_for_inactive_and_suspended_student_201', async () => {
  for (const status of ['inactive', 'suspended']) {
    const student = await createAdult(reception, next());
    await setStatus(stack, student.id, status);

    const response = await grant(reception, student.id, image());

    expect(response.status, status).toBe(201);
  }
});

test('consent_routes_403_for_hr_finance_and_instructor', async () => {
  const student = await createAdult(reception, next());
  const consentId = await insertConsent(stack, { studentId: student.id });
  // o login de cada sessão também grava na trilha: as sessões nascem antes da contagem de partida
  const sessions = [await stack.session('hr_finance'), await stack.session('instructor')];
  const total = await consentCount(stack);
  const logs = await auditCount(stack);

  for (const { user, client } of sessions) {
    const role: Role = user.role;
    const routes: Array<[string, Promise<Response>]> = [
      ['GET /api/consent-terms', client.get('/api/consent-terms')],
      ['GET consents', client.get(`/api/students/${student.id}/consents`)],
      ['POST consents', grant(client, student.id, image())],
      ['DELETE consent', client.delete(`/api/students/${student.id}/consents/${consentId}`)],
    ];
    for (const [label, pending] of routes) {
      const response = await pending;

      expect(response.status, `${role} ${label}`).toBe(403);
      expect((await problem(response)).code, `${role} ${label}`).toBe('forbidden');
    }
  }
  expect(await consentCount(stack)).toBe(total);
  expect(await auditCount(stack)).toBe(logs);
  expect((await consentRows(stack, student.id)).map(parse)[0]!.revoked_at).toBeNull();
});

test('consent_routes_401_without_session', async () => {
  const anonymous = stack.client();
  const id = unknownId();
  const routes: Array<[string, Promise<Response>]> = [
    ['GET /api/consent-terms', anonymous.get('/api/consent-terms')],
    ['GET consents', anonymous.get(`/api/students/${id}/consents`)],
    ['POST consents', anonymous.post(`/api/students/${id}/consents`, image())],
    ['DELETE consent', anonymous.delete(`/api/students/${id}/consents/${unknownId()}`)],
  ];
  for (const [label, pending] of routes) {
    const response = await pending;

    expect(response.status, label).toBe(401);
    expect((await problem(response)).code, label).toBe('unauthorized');
  }
});
