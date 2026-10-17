import type { AuditLogsResponse, CheckInsReport, DashboardResponse, StudentsResponse } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { jpegBytes, type PhotoStack, replacePhoto, startPhotoStack, uploadPhoto } from './support/photos.ts';
import { ANONYMIZED_NAME, anonymizationPath, type FullStudent, privacySnapshot, seedFullStudent } from './support/privacy.ts';
import { problem } from './support/stack.ts';

let env: PhotoStack;
let admin: Awaited<ReturnType<PhotoStack['stack']['session']>>;

beforeAll(async () => {
  env = await startPhotoStack();
  admin = await env.stack.session('admin');
}, 180_000);

afterAll(() => env?.close());

async function anonymized(): Promise<FullStudent> {
  const subject = await seedFullStudent(env.stack, env.minio);
  const response = await admin.client.post(anonymizationPath(subject.id));
  expect(response.status, 'anonimização de preparação').toBe(204);
  return subject;
}

/** As 21 rotas sob `/api/students/:id`, com os ids das linhas que o aluno tinha (C25). */
function studentRoutes(subject: FullStudent, bytes: Buffer): Array<[label: string, send: (client: Client) => Promise<Response>]> {
  const base = `/api/students/${subject.id}`;
  return [
    ['GET /api/students/:id', (client) => client.get(base)],
    ['PATCH /api/students/:id', (client) => client.patch(base, { phone: '11977776666' })],
    ['DELETE /api/students/:id', (client) => client.delete(base)],
    ['GET .../consents', (client) => client.get(`${base}/consents`)],
    ['POST .../consents', (client) => client.post(`${base}/consents`, { purpose: 'image_use', termVersion: 1, grantedBy: 'student' })],
    ['DELETE .../consents/:consentId', (client) => client.delete(`${base}/consents/${subject.consentIds[0]}`)],
    ['POST .../photo', (client) => uploadPhoto(client, subject.id, bytes)],
    ['PUT .../photo', (client) => replacePhoto(client, subject.id, bytes)],
    ['GET .../photo', (client) => client.get(`${base}/photo`)],
    ['DELETE .../photo', (client) => client.delete(`${base}/photo`)],
    ['GET .../enrollments', (client) => client.get(`${base}/enrollments`)],
    ['POST .../enrollments', (client) => client.post(`${base}/enrollments`, { planId: subject.planId, startsAt: '2026-10-20' })],
    ['DELETE .../enrollments/:enrollmentId', (client) => client.delete(`${base}/enrollments/${subject.paidEnrollmentId}`)],
    ['GET .../payments', (client) => client.get(`${base}/payments`)],
    ['POST .../payments', (client) => client.post(`${base}/payments`, { enrollmentId: subject.cancelledEnrollmentId })],
    ['DELETE .../payments/:paymentId', (client) => client.delete(`${base}/payments/${subject.alivePaymentId}`)],
    ['GET .../check-in-status', (client) => client.get(`${base}/check-in-status`)],
    ['GET .../check-ins', (client) => client.get(`${base}/check-ins`)],
    ['POST .../check-ins', (client) => client.post(`${base}/check-ins`)],
    ['GET .../data-export', (client) => client.get(`${base}/data-export`)],
    ['POST .../anonymization', (client) => client.post(`${base}/anonymization`)],
  ];
}

/** Todos os itens da lista, página por página. */
async function listAll(client: Client, query: Record<string, string> = {}) {
  const items: StudentsResponse['items'] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ ...query, ...(cursor ? { cursor } : {}) });
    const response = await client.get(`/api/students?${params}`);
    expect(response.status).toBe(200);
    const page = (await response.json()) as StudentsResponse;
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

test('every_student_route_is_404_for_anonymized_twenty_one_routes', async () => {
  const subject = await anonymized();
  const routes = studentRoutes(subject, await jpegBytes());
  expect(routes).toHaveLength(21);
  const before = await privacySnapshot(env.stack, env.minio);

  for (const [label, send] of routes) {
    const response = await send(admin.client);
    expect(response.status, label).toBe(404);
    expect((await problem(response)).code, label).toBe('not_found');
  }

  expect(await privacySnapshot(env.stack, env.minio)).toEqual(before);
});

test('student_list_omits_anonymized_in_items_and_total', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const queries: Array<Record<string, string>> = [{}, { status: 'inactive' }, { q: 'Titular' }];
  const before = [];
  for (const query of queries) {
    const items = await listAll(admin.client, query);
    expect(items.map((item) => item.id), JSON.stringify(query)).toContain(subject.id);
    before.push(items.length);
  }

  expect((await admin.client.post(anonymizationPath(subject.id))).status).toBe(204);

  for (const [index, query] of queries.entries()) {
    const items = await listAll(admin.client, query);
    expect(items.map((item) => item.id), JSON.stringify(query)).not.toContain(subject.id);
    // o total da lista, contado em todas as páginas
    expect(items.length, JSON.stringify(query)).toBe(before[index]! - 1);
  }
});

test('dashboard_student_counts_omit_anonymized', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const counts = async () => {
    const response = await admin.client.get('/api/dashboard');
    expect(response.status).toBe(200);
    return ((await response.json()) as DashboardResponse).students;
  };
  const before = await counts();

  expect((await admin.client.post(anonymizationPath(subject.id))).status).toBe(204);

  const after = await counts();
  expect(after.inactive).toBe(before.inactive - 1);
  expect(after.active).toBe(before.active);
  expect(after.suspended).toBe(before.suspended);
});

test('check_in_report_keeps_presence_named_titular_anonimizado', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const day = '2026-08-05';
  const report = async () => {
    const response = await admin.client.get(`/api/check-ins?from=${day}&to=${day}`);
    expect(response.status).toBe(200);
    return (await response.json()) as CheckInsReport;
  };
  const before = await report();
  expect(before.items.find((item) => item.student.id === subject.id)?.student.name).toBe(subject.name);

  expect((await admin.client.post(anonymizationPath(subject.id))).status).toBe(204);

  const after = await report();
  const item = after.items.find((entry) => entry.student.id === subject.id);
  expect(item?.student).toEqual({ id: subject.id, name: ANONYMIZED_NAME });
  expect(after.total).toBe(before.total);
});

test('audit_log_keeps_every_row_of_the_anonymized_student', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  // linhas do titular antes da anonimização: uma edição e uma exportação
  expect((await admin.client.patch(`/api/students/${subject.id}`, { phone: '11955554444' })).status).toBe(200);
  expect((await admin.client.get(`/api/students/${subject.id}/data-export`)).status).toBe(200);
  const read = async () => {
    const response = await admin.client.get(`/api/audit-logs?entityId=${subject.id}`);
    expect(response.status).toBe(200);
    return ((await response.json()) as AuditLogsResponse).items;
  };
  const before = await read();
  expect(before.map((item) => item.action).sort()).toEqual(['student.exported', 'student.updated']);

  expect((await admin.client.post(anonymizationPath(subject.id))).status).toBe(204);

  const after = await read();
  expect(after.filter((item) => before.some((old) => old.id === item.id))).toEqual(before);
  const added = after.filter((item) => !before.some((old) => old.id === item.id));
  expect(added.map((item) => item.action)).toEqual(['student.anonymized']);
});

test('anonymized_404s_write_no_audit_and_old_phone_or_cpf_finds_nothing', async () => {
  const subject = await anonymized();
  const before = await auditCount(env.stack);

  for (const [label, send] of studentRoutes(subject, await jpegBytes())) {
    expect((await send(admin.client)).status, label).toBe(404);
  }

  expect(await auditCount(env.stack)).toBe(before);
  for (const q of [subject.phone, subject.cpf]) {
    expect((await listAll(admin.client, { q })).map((item) => item.id), q).not.toContain(subject.id);
  }
});
