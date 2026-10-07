import {
  auditLogsQuerySchema,
  changePasswordRequestSchema,
  createStaffRequestSchema,
  createStudentRequestSchema,
  createUserRequestSchema,
  grantConsentRequestSchema,
  guardianRequestSchema,
  linkStaffUserRequestSchema,
  loginRequestSchema,
  photoFileQuerySchema,
  photoQuerySchema,
  passwordConfirmationRequestSchema,
  resetPasswordRequestSchema,
  studentsQuerySchema,
  twoFactorConfirmRequestSchema,
  twoFactorVerifyRequestSchema,
  updateStaffRequestSchema,
  updateStudentRequestSchema,
  updateUserRequestSchema,
} from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { z } from 'zod';
import { type Stack, startStack } from './support/stack.ts';

interface OpenApiDocument {
  openapi: string;
  paths: Record<
    string,
    Record<
      string,
      {
        requestBody?: { content: Record<string, { schema: unknown }> };
        parameters?: Array<{ name: string; in: string; required?: boolean; schema: unknown }>;
      }
    >
  >;
}

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

async function document() {
  const { client } = await stack.session('reception');
  const response = await client.get('/api/openapi.json');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toMatch(/^application\/json\b/);
  return (await response.json()) as OpenApiDocument;
}

test('openapi_200_is_3_1', async () => {
  const body = await document();

  expect(body.openapi.startsWith('3.1')).toBe(true);
});

test('paths_equal_registered_api_routes', async () => {
  const registered = stack.api
    .routes()
    .filter(({ path }) => path.startsWith('/api/'))
    .map(({ method, path }) => `${method} ${path.replace(/:(\w+)/g, '{$1}')}`);
  expect(registered.length).toBeGreaterThanOrEqual(14);

  const { paths } = await document();
  const documented = Object.entries(paths).flatMap(([path, operations]) =>
    Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
  );

  expect(documented.sort()).toEqual(registered.sort());
});

test('audit_logs_query_parameters_come_from_contract_schema', async () => {
  const names = ['from', 'to', 'userId', 'action', 'entity', 'entityId', 'ip', 'cursor'];
  const properties = JSON.parse(JSON.stringify(z.toJSONSchema(auditLogsQuerySchema).properties)) as Record<
    string,
    unknown
  >;
  expect(Object.keys(properties).sort()).toEqual([...names].sort());

  const { paths } = await document();
  const parameters = paths['/api/audit-logs']?.get?.parameters ?? [];

  expect(parameters).toHaveLength(8);
  expect(parameters.map((parameter) => parameter.name).sort()).toEqual([...names].sort());
  for (const parameter of parameters) {
    expect(parameter.in, parameter.name).toBe('query');
    expect(parameter.required, parameter.name).not.toBe(true);
    expect(parameter.schema, parameter.name).toEqual(properties[parameter.name]);
  }
});

test('students_paths_and_query_parameters_come_from_contract_schema', async () => {
  const names = ['q', 'status', 'cursor'];
  const properties = JSON.parse(JSON.stringify(z.toJSONSchema(studentsQuerySchema).properties)) as Record<
    string,
    unknown
  >;
  expect(Object.keys(properties).sort()).toEqual([...names].sort());

  const { paths } = await document();
  expect(Object.keys(paths['/api/students'] ?? {}).sort()).toEqual(['get', 'post']);
  expect(Object.keys(paths['/api/students/{id}'] ?? {}).sort()).toEqual(['delete', 'get', 'patch']);
  const parameters = paths['/api/students']?.get?.parameters ?? [];

  expect(parameters).toHaveLength(3);
  expect(parameters.map((parameter) => parameter.name).sort()).toEqual([...names].sort());
  for (const parameter of parameters) {
    expect(parameter.in, parameter.name).toBe('query');
    expect(parameter.required, parameter.name).not.toBe(true);
    expect(parameter.schema, parameter.name).toEqual(properties[parameter.name]);
  }
});

test('request_bodies_come_from_contract_schemas', async () => {
  const contracts: Array<[method: string, path: string, schema: z.ZodType]> = [
    ['post', '/api/auth/login', loginRequestSchema],
    ['post', '/api/auth/two-factor/verify', twoFactorVerifyRequestSchema],
    ['put', '/api/auth/password', changePasswordRequestSchema],
    ['post', '/api/auth/two-factor/enable', passwordConfirmationRequestSchema],
    ['post', '/api/auth/two-factor/confirm', twoFactorConfirmRequestSchema],
    ['post', '/api/auth/two-factor/disable', passwordConfirmationRequestSchema],
    ['post', '/api/users', createUserRequestSchema],
    ['patch', '/api/users/{id}', updateUserRequestSchema],
    ['put', '/api/users/{id}/password', resetPasswordRequestSchema],
    ['post', '/api/students', createStudentRequestSchema],
    ['patch', '/api/students/{id}', updateStudentRequestSchema],
    ['post', '/api/students/{id}/consents', grantConsentRequestSchema],
    ['post', '/api/staff', createStaffRequestSchema],
    ['patch', '/api/staff/{id}', updateStaffRequestSchema],
    ['put', '/api/staff/{id}/user', linkStaffUserRequestSchema],
  ];
  expect(contracts).toHaveLength(15);

  const { paths } = await document();

  for (const [method, path, schema] of contracts) {
    const documented = paths[path]?.[method]?.requestBody?.content['application/json']?.schema;

    expect(documented, `${method} ${path}`).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(schema))));
  }
  // nenhuma outra rota declara corpo, salvo o envio e a troca de foto, que são `multipart/form-data` e não têm schema Zod
  const withBody = Object.entries(paths).flatMap(([path, operations]) =>
    Object.entries(operations)
      .filter(([, operation]) => operation.requestBody)
      .map(([method]) => `${method} ${path}`),
  );
  expect(withBody.sort()).toEqual(
    [
      ...contracts.map(([method, path]) => `${method} ${path}`),
      'post /api/students/{id}/photo',
      'put /api/students/{id}/photo',
      'post /api/staff/{id}/photo',
      'put /api/staff/{id}/photo',
    ].sort(),
  );
});

test('consent_paths_and_guardian_body_come_from_contract_schemas', async () => {
  const { paths } = await document();
  const json = (schema: z.ZodType) => JSON.parse(JSON.stringify(z.toJSONSchema(schema))) as Record<string, unknown>;

  expect(Object.keys(paths['/api/consent-terms'] ?? {})).toEqual(['get']);
  expect(Object.keys(paths['/api/students/{id}/consents'] ?? {}).sort()).toEqual(['get', 'post']);
  expect(Object.keys(paths['/api/students/{id}/consents/{consentId}'] ?? {})).toEqual(['delete']);

  expect(paths['/api/students/{id}/consents']?.post?.requestBody?.content['application/json']?.schema).toEqual(
    json(grantConsentRequestSchema),
  );
  // o `guardian` do corpo de alunos é o mesmo schema do contrato, sem o `$schema` de quem está sozinho
  const guardian = { ...json(guardianRequestSchema), $schema: undefined };
  delete guardian.$schema;
  for (const [method, path] of [
    ['post', '/api/students'],
    ['patch', '/api/students/{id}'],
  ] as const) {
    const body = paths[path]?.[method]?.requestBody?.content['application/json']?.schema as {
      properties: Record<string, unknown>;
    };
    expect(body.properties.guardian, `${method} ${path}`).toEqual(guardian);
  }
});

test('photo_paths_and_query_parameters_come_from_contract_schema', async () => {
  const json = (schema: z.ZodType) => JSON.parse(JSON.stringify(z.toJSONSchema(schema))) as { properties: Record<string, unknown> };
  const { paths } = await document();

  expect(Object.keys(paths['/api/students/{id}/photo'] ?? {}).sort()).toEqual(['delete', 'get', 'post', 'put']);
  expect(Object.keys(paths['/api/photo-files/{photoId}/{variant}'] ?? {})).toEqual(['get']);

  const query = (paths['/api/students/{id}/photo']?.get?.parameters ?? []).filter((parameter) => parameter.in === 'query');
  expect(query).toHaveLength(1);
  expect(query[0]!.name).toBe('variant');
  expect(query[0]!.required).not.toBe(true);
  expect(query[0]!.schema).toEqual(json(photoQuerySchema).properties.variant);

  const fileQuery = (paths['/api/photo-files/{photoId}/{variant}']?.get?.parameters ?? []).filter((parameter) => parameter.in === 'query');
  expect(fileQuery.map((parameter) => parameter.name).sort()).toEqual(Object.keys(json(photoFileQuerySchema).properties).sort());
  expect(fileQuery.map((parameter) => parameter.name).sort()).toEqual(['exp', 'sig']);

  expect(paths['/api/students/{id}/photo']?.post?.requestBody?.content['application/json']).toBeUndefined();
});

test('photo_put_is_multipart_with_the_post_response_schema', async () => {
  const { paths } = await document();
  const photo = paths['/api/students/{id}/photo'] ?? {};

  expect(Object.keys(photo).sort()).toEqual(['delete', 'get', 'post', 'put']);
  const body = photo.put?.requestBody?.content ?? {};
  expect(Object.keys(body)).toEqual(['multipart/form-data']);
  expect(body['application/json']).toBeUndefined();
  expect(body['multipart/form-data']?.schema).toMatchObject({
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' } },
  });

  const responses = (operation: unknown) => (operation as { responses: Record<string, { content?: Record<string, { schema: unknown }> }> }).responses;
  const created = responses(photo.put)['201']?.content?.['application/json']?.schema;
  expect(Object.keys(responses(photo.put))).toEqual(['201']);
  expect(created).toBeDefined();
  expect(created).toEqual(responses(photo.post)['201']?.content?.['application/json']?.schema);
});
