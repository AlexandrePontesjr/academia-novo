import { request } from 'node:http';
import type { Staff } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { WEB_ORIGIN } from './support/app.ts';
import { auditCount, auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { captureOutput } from './support/log.ts';
import { problem, type SeededUser, type Stack, startStack } from './support/stack.ts';
import { cpfOf, maskCpf, unknownId } from './support/students.ts';
import { createStaff, fullStaffBody, insertStaff, setStaffStatus, staffBody, staffRowText } from './support/staff.ts';

let stack: Stack;
let admin: Client;
let adminUser: SeededUser;
let hr: Client;
let hrUser: SeededUser;
let reception: Client;
let counter = 7000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  ({ client: admin, user: adminUser } = await stack.session('admin'));
  ({ client: hr, user: hrUser } = await stack.session('hr_finance'));
  ({ client: reception } = await stack.session('reception'));
}, 180_000);

afterEach(() => vi.restoreAllMocks());
afterAll(() => stack?.close());

/** Todas as linhas de `staff`, como texto, para a comparação "ficou como estava". */
const staffSnapshot = async () =>
  (await stack.query<{ row: string }>('select to_jsonb(s)::text as row from staff s order by id')).map((row) => row.row);

test('create_writes_one_staff_created_row', async () => {
  for (const [client, author] of [
    [admin, adminUser],
    [hr, hrUser],
  ] as const) {
    const { result: response, rows } = await written(stack, () => client.post('/api/staff', staffBody(next())));
    const created = (await response.json()) as Staff;

    expect(response.status, author.email).toBe(201);
    expect(rows, author.email).toHaveLength(1);
    expect(rows[0], author.email).toMatchObject({
      action: 'staff.created',
      user_id: author.id,
      entity: 'staff',
      entity_id: created.id,
    });
  }
});

test('create_diff_names_the_fields_and_status_only', async () => {
  const short = await written(stack, () => hr.post('/api/staff', staffBody(next())));

  expect(short.rows).toHaveLength(1);
  expect(short.rows[0]!.diff).toEqual({
    fields: ['name', 'cpf', 'position', 'hiredAt', 'phone', 'status'],
    values: { status: { from: null, to: 'active' } },
  });

  const full = await written(stack, () => hr.post('/api/staff', fullStaffBody(next())));

  expect(full.rows).toHaveLength(1);
  const diff = full.rows[0]!.diff as { fields: string[]; values: unknown };
  expect([...diff.fields].sort()).toEqual(['cpf', 'department', 'email', 'hiredAt', 'name', 'phone', 'position', 'status']);
  expect(diff.values).toEqual({ status: { from: null, to: 'active' } });
});

test('patch_writes_one_staff_updated_row_with_field_names_only', async () => {
  const created = await createStaff(hr, fullStaffBody(next()));

  const both = await written(stack, () => hr.patch(`/api/staff/${created.id}`, { position: 'Gerente Geral', phone: '11977776666' }));

  expect(both.result.status).toBe(200);
  expect(both.rows).toHaveLength(1);
  expect(both.rows[0]).toMatchObject({
    action: 'staff.updated',
    user_id: hrUser.id,
    entity: 'staff',
    entity_id: created.id,
    diff: { fields: ['position', 'phone'], values: {} },
  });

  const others: Array<[field: string, value: string]> = [
    ['name', 'Outro Nome Completo'],
    ['cpf', cpfOf(next())],
    ['department', 'Outro Setor'],
    ['hiredAt', '2018-07-01'],
    ['email', 'outro.endereco@exemplo.com'],
  ];
  for (const [field, value] of others) {
    const { result, rows } = await written(stack, () => admin.patch(`/api/staff/${created.id}`, { [field]: value }));

    expect(result.status, field).toBe(200);
    expect(rows, field).toHaveLength(1);
    expect(rows[0], field).toMatchObject({
      action: 'staff.updated',
      user_id: adminUser.id,
      entity: 'staff',
      entity_id: created.id,
      diff: { fields: [field], values: {} },
    });
  }
});

test('reactivation_diff_records_status_from_inactive_to_active', async () => {
  const created = await createStaff(hr, staffBody(next()));
  await setStaffStatus(stack, created.id, 'inactive');

  const { result, rows } = await written(stack, () => hr.patch(`/api/staff/${created.id}`, { status: 'active' }));

  expect(result.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'staff.updated',
    diff: { fields: ['status'], values: { status: { from: 'inactive', to: 'active' } } },
  });
});

test('patch_without_change_nine_cases_writes_no_row', async () => {
  const created = await createStaff(hr, fullStaffBody(next()));
  const before = await staffRowText(stack, created.id);
  const cases: Array<[label: string, body: Record<string, unknown>]> = [
    ['name', { name: created.name }],
    ['cpf com máscara', { cpf: maskCpf(created.cpf) }],
    ['position', { position: created.position }],
    ['department', { department: created.department }],
    ['hiredAt', { hiredAt: created.hiredAt }],
    ['phone', { phone: created.phone }],
    ['email', { email: created.email }],
    ['status igual', { status: 'active' }],
    ['corpo vazio', {}],
  ];
  expect(cases).toHaveLength(9);

  for (const [label, body] of cases) {
    const count = await auditCount(stack);

    const response = await hr.patch(`/api/staff/${created.id}`, body);

    expect(response.status, label).toBe(200);
    expect(await auditCount(stack), label).toBe(count);
    expect(await staffRowText(stack, created.id), label).toBe(before);
  }
});

test('inactivate_writes_one_staff_inactivated_row', async () => {
  const created = await createStaff(hr, staffBody(next()));

  const { result, rows } = await written(stack, () => hr.delete(`/api/staff/${created.id}`));

  expect(result.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'staff.inactivated',
    user_id: hrUser.id,
    entity: 'staff',
    entity_id: created.id,
    diff: { fields: ['status'], values: { status: { from: 'active', to: 'inactive' } } },
  });
});

test('link_writes_one_user_linked_row_and_same_user_none', async () => {
  const userA = await stack.seed({ role: 'reception' });
  const userB = await stack.seed({ role: 'instructor' });
  const [id] = await insertStaff(stack, [{ name: 'Vinculada', cpf: cpfOf(next()) }]);

  const first = await written(stack, () => admin.put(`/api/staff/${id}/user`, { userId: userA.id }));

  expect(first.result.status).toBe(204);
  expect(first.rows).toHaveLength(1);
  expect(first.rows[0]).toMatchObject({
    action: 'staff.user_linked',
    user_id: adminUser.id,
    entity: 'staff',
    entity_id: id,
    diff: { fields: ['userId'], values: { userId: { from: null, to: userA.id } } },
  });

  const swapped = await written(stack, () => admin.put(`/api/staff/${id}/user`, { userId: userB.id }));

  expect(swapped.result.status).toBe(204);
  expect(swapped.rows).toHaveLength(1);
  expect(swapped.rows[0]).toMatchObject({
    action: 'staff.user_linked',
    diff: { fields: ['userId'], values: { userId: { from: userA.id, to: userB.id } } },
  });

  const same = await written(stack, () => admin.put(`/api/staff/${id}/user`, { userId: userB.id }));

  expect(same.result.status).toBe(204);
  expect(same.rows).toEqual([]);
});

test('unlink_writes_one_user_unlinked_row_and_none_without_link', async () => {
  const user = await stack.seed({ role: 'reception' });
  const [linked, free] = await insertStaff(stack, [
    { name: 'Com Vínculo', cpf: cpfOf(next()), userId: user.id },
    { name: 'Sem Vínculo', cpf: cpfOf(next()) },
  ]);

  const unlinked = await written(stack, () => admin.delete(`/api/staff/${linked}/user`));

  expect(unlinked.result.status).toBe(204);
  expect(unlinked.rows).toHaveLength(1);
  expect(unlinked.rows[0]).toMatchObject({
    action: 'staff.user_unlinked',
    user_id: adminUser.id,
    entity: 'staff',
    entity_id: linked,
    diff: { fields: ['userId'], values: { userId: { from: user.id, to: null } } },
  });

  const nothing = await written(stack, () => admin.delete(`/api/staff/${free}/user`));

  expect(nothing.result.status).toBe(204);
  expect(nothing.rows).toEqual([]);
});

test('twenty_one_non_writing_write_outcomes_write_no_audit_row', async () => {
  const anonymous = stack.client();
  const staff = await createStaff(hr, staffBody(next()));
  const other = await createStaff(hr, staffBody(next()));
  const inactive = await createStaff(hr, staffBody(next()));
  await setStaffStatus(stack, inactive.id, 'inactive');
  const owner = await stack.seed({ role: 'reception' });
  const [linkedElsewhere] = await insertStaff(stack, [{ name: 'Dona do Usuário', cpf: cpfOf(next()), userId: owner.id }]);
  expect(linkedElsewhere).toBeDefined();
  const ghost = unknownId();
  const cases: Array<[name: string, expected: number, send: () => Promise<Response>]> = [
    ['POST 401', 401, () => anonymous.post('/api/staff', staffBody(next()))],
    ['POST 403', 403, () => reception.post('/api/staff', staffBody(next()))],
    ['POST 409', 409, () => hr.post('/api/staff', staffBody(next(), { cpf: staff.cpf }))],
    ['POST 422', 422, () => hr.post('/api/staff', staffBody(next(), { cpf: '529.982.247-24' }))],
    ['PATCH 401', 401, () => anonymous.patch(`/api/staff/${staff.id}`, { position: 'Qualquer' })],
    ['PATCH 403', 403, () => reception.patch(`/api/staff/${staff.id}`, { position: 'Qualquer' })],
    ['PATCH 404', 404, () => hr.patch(`/api/staff/${ghost}`, { position: 'Qualquer' })],
    ['PATCH 409', 409, () => hr.patch(`/api/staff/${staff.id}`, { cpf: other.cpf })],
    ['PATCH 422', 422, () => hr.patch(`/api/staff/${staff.id}`, { status: 'inactive' })],
    ['DELETE 401', 401, () => anonymous.delete(`/api/staff/${staff.id}`)],
    ['DELETE 403', 403, () => reception.delete(`/api/staff/${staff.id}`)],
    ['DELETE 404', 404, () => hr.delete(`/api/staff/${ghost}`)],
    ['DELETE de inativo 204', 204, () => hr.delete(`/api/staff/${inactive.id}`)],
    ['PUT vínculo 401', 401, () => anonymous.put(`/api/staff/${staff.id}/user`, { userId: owner.id })],
    ['PUT vínculo 403', 403, () => hr.put(`/api/staff/${staff.id}/user`, { userId: owner.id })],
    ['PUT vínculo 404', 404, () => admin.put(`/api/staff/${ghost}/user`, { userId: owner.id })],
    ['PUT vínculo 409', 409, () => admin.put(`/api/staff/${staff.id}/user`, { userId: owner.id })],
    ['PUT vínculo 422', 422, () => admin.put(`/api/staff/${staff.id}/user`, { userId: 'abc' })],
    ['DELETE vínculo 401', 401, () => anonymous.delete(`/api/staff/${staff.id}/user`)],
    ['DELETE vínculo 403', 403, () => hr.delete(`/api/staff/${staff.id}/user`)],
    ['DELETE vínculo 404', 404, () => admin.delete(`/api/staff/${ghost}/user`)],
  ];
  expect(cases).toHaveLength(21);

  for (const [name, expected, send] of cases) {
    const count = await auditCount(stack);

    const response = await send();

    expect(response.status, name).toBe(expected);
    expect(await auditCount(stack), name).toBe(count);
  }
});

test('audit_insert_failure_500_rolls_back_five_write_routes', async () => {
  const linkedUser = await stack.seed({ role: 'reception' });
  const freeUser = await stack.seed({ role: 'instructor' });
  const [target, linked] = await insertStaff(stack, [
    { name: 'Alvo das Escritas', cpf: cpfOf(next()) },
    { name: 'Alvo do Desvínculo', cpf: cpfOf(next()), userId: linkedUser.id },
  ]);
  const routes: Array<[name: string, send: () => Promise<Response>]> = [
    ['POST', () => hr.post('/api/staff', staffBody(next()))],
    ['PATCH', () => hr.patch(`/api/staff/${target}`, { position: 'Cargo Novo', status: 'active' })],
    ['DELETE', () => hr.delete(`/api/staff/${target}`)],
    ['PUT vínculo', () => admin.put(`/api/staff/${target}/user`, { userId: freeUser.id })],
    ['DELETE vínculo', () => admin.delete(`/api/staff/${linked}/user`)],
  ];

  for (const [name, send] of routes) {
    const before = await staffSnapshot();

    const response = await withAuditInsertFailing(stack, send);

    expect(response.status, name).toBe(500);
    expect((await problem(response)).code, name).toBe('internal_error');
    expect(await staffSnapshot(), name).toEqual(before);
  }
});

test('seven_staff_values_never_reach_audit_logs', async () => {
  const first = {
    name: 'Rafaela Prado Cunha',
    cpf: '529.982.247-25',
    position: 'Fisioterapeuta Esportiva',
    department: 'Reabilitação',
    hiredAt: '2021-03-15',
    phone: '(11) 91234-5678',
    email: 'rafaela.prado@exemplo.com',
  };
  const second = {
    name: 'Rafaela Sigilosa Cunha',
    cpf: cpfOf(next()),
    position: 'Coordenadora Sigilosa',
    department: 'Setor Sigiloso',
    hiredAt: '2022-08-09',
    phone: '(11) 3333-4444',
    email: 'rafaela.sigilosa@exemplo.com',
  };
  const user = await stack.seed({ role: 'reception' });
  const leaks = (text: string, values: string[]) => values.filter((value) => text.includes(value));
  const firstValues = [...Object.values(first), '52998224725', '11912345678'];
  const secondValues = [...Object.values(second), second.cpf, maskCpf(second.cpf), '1133334444'];

  const created = await createStaff(hr, first);
  const afterCreate = (await auditRows(stack)).map((row) => JSON.stringify(row)).join('\n');
  expect(afterCreate).toContain('staff.created');
  expect(leaks(afterCreate, firstValues), 'depois da criação').toEqual([]);

  expect((await hr.patch(`/api/staff/${created.id}`, second)).status).toBe(200);
  const afterEdit = (await auditRows(stack)).map((row) => JSON.stringify(row)).join('\n');
  expect(afterEdit).toContain('staff.updated');
  expect(leaks(afterEdit, [...firstValues, ...secondValues]), 'depois da edição').toEqual([]);

  expect((await admin.put(`/api/staff/${created.id}/user`, { userId: user.id })).status).toBe(204);
  expect((await hr.delete(`/api/staff/${created.id}`)).status).toBe(204);
  const text = (await auditRows(stack)).map((row) => JSON.stringify(row)).join('\n');
  expect(text).toContain('staff.user_linked');
  expect(text).toContain('staff.inactivated');
  expect(leaks(text, [...firstValues, ...secondValues])).toEqual([]);
});

/** Uma requisição autenticada pelo `node:http`, que não acrescenta `User-Agent` nem mexe nos cabeçalhos dados. */
function send(method: string, path: string, client: Client, headers: Record<string, string>, body?: unknown) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<number>((resolve, reject) => {
    const req = request(
      `${stack.api.url}${path}`,
      {
        method,
        headers: {
          Origin: WEB_ORIGIN,
          Cookie: client.cookie(),
          ...(payload && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
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
}

test('ip_and_user_agent_on_the_seven_staff_actions', async () => {
  const agent = `teste/1.0 ${'x'.repeat(600)}`.slice(0, 512) + 'Z';
  expect(agent).toHaveLength(513);
  const twoHops = { 'X-Forwarded-For': '198.51.100.1, 203.0.113.7' };
  const oneHop = { 'X-Forwarded-For': '203.0.113.7' };
  const variants: Array<[label: string, headers: Record<string, string>, userAgent: string | null]> = [
    ['dois valores e User-Agent de 513', { ...twoHops, 'User-Agent': agent }, agent.slice(0, 512)],
    ['um valor e User-Agent de 513', { ...oneHop, 'User-Agent': agent }, agent.slice(0, 512)],
    ['sem User-Agent', twoHops, null],
  ];
  const actions: Array<[action: string, run: (headers: Record<string, string>) => Promise<number>]> = [
    ['staff.created', (headers) => send('POST', '/api/staff', hr, headers, staffBody(next()))],
    [
      'staff.updated',
      async (headers) => {
        const staff = await createStaff(hr, staffBody(next()));
        return send('PATCH', `/api/staff/${staff.id}`, hr, headers, { position: 'Cargo Novo' });
      },
    ],
    [
      'staff.inactivated',
      async (headers) => {
        const staff = await createStaff(hr, staffBody(next()));
        return send('DELETE', `/api/staff/${staff.id}`, hr, headers);
      },
    ],
    [
      'staff.viewed',
      async (headers) => {
        const staff = await createStaff(hr, staffBody(next()));
        return send('GET', `/api/staff/${staff.id}`, hr, headers);
      },
    ],
    ['staff.list_viewed', (headers) => send('GET', '/api/staff', hr, headers)],
    [
      'staff.user_linked',
      async (headers) => {
        const staff = await createStaff(hr, staffBody(next()));
        const user = await stack.seed({ role: 'reception' });
        return send('PUT', `/api/staff/${staff.id}/user`, admin, headers, { userId: user.id });
      },
    ],
    [
      'staff.user_unlinked',
      async (headers) => {
        const user = await stack.seed({ role: 'reception' });
        const [id] = await insertStaff(stack, [{ name: 'Desvinculada', cpf: cpfOf(next()), userId: user.id }]);
        return send('DELETE', `/api/staff/${id}/user`, admin, headers);
      },
    ],
  ];
  expect(actions).toHaveLength(7);

  for (const [action, run] of actions) {
    for (const [label, headers, userAgent] of variants) {
      const count = (await auditRows(stack)).length;
      const status = await run(headers);
      const rows = (await auditRows(stack)).slice(count).filter((row) => row.action === action);

      expect([200, 201, 204], `${action} ${label}`).toContain(status);
      expect(rows, `${action} ${label}`).toHaveLength(1);
      expect(rows[0]!.ip, `${action} ${label}`).toBe('203.0.113.7');
      expect(rows[0]!.user_agent, `${action} ${label}`).toBe(userAgent);
    }
  }
});

test('staff_cpf_phone_email_never_reach_the_log', async () => {
  const body = fullStaffBody(next(), { email: 'segredo.do.log@exemplo.com', phone: '(11) 98877-6655' });
  const cpf = body.cpf;
  const taken = staffBody(next(), { cpf });
  const output = captureOutput();

  const created = (await (await hr.post('/api/staff', body)).json()) as Staff;
  await hr.patch(`/api/staff/${created.id}`, { phone: '(11) 97766-5544', email: 'segundo.segredo@exemplo.com' });
  const user = await stack.seed({ role: 'reception' });
  await admin.put(`/api/staff/${created.id}/user`, { userId: user.id });
  await hr.get('/api/staff');
  await hr.get(`/api/staff/${created.id}`);
  const invalid = await hr.post('/api/staff', staffBody(next(), { cpf: '529.982.247-24' }));
  const repeated = await hr.post('/api/staff', taken);
  await hr.delete(`/api/staff/${created.id}`);
  const failing = await withAuditInsertFailing(stack, () =>
    hr.post('/api/staff', staffBody(next(), { cpf: '123.456.789-09', phone: '(11) 95544-3322', email: 'terceiro.segredo@exemplo.com' })),
  );
  const logged = output.text();
  vi.restoreAllMocks();

  expect(invalid.status).toBe(422);
  expect(repeated.status).toBe(409);
  expect(failing.status).toBe(500);
  expect(logged).toMatch(/"msg":"request"/);
  const secrets: Record<string, string> = {
    'CPF em dígitos': cpf,
    'CPF mascarado': maskCpf(cpf),
    'telefone em dígitos': '11988776655',
    'telefone mascarado': '(11) 98877-6655',
    'segundo telefone': '11977665544',
    'e-mail': 'segredo.do.log@exemplo.com',
    'segundo e-mail': 'segundo.segredo@exemplo.com',
    'CPF recusado': '52998224724',
    'CPF da falha': '12345678909',
    'telefone da falha': '11955443322',
    'e-mail da falha': 'terceiro.segredo@exemplo.com',
  };
  for (const [name, value] of Object.entries(secrets)) {
    expect(logged.includes(value), `${name} no log`).toBe(false);
  }
});
