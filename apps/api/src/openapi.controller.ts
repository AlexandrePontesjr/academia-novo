import { Controller, Get, Inject } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { z } from 'zod';
import { Authenticated } from './access.ts';
import { isApiRoute, listRoutes, type Route } from './routes.ts';
import { inputOf, outputOf, queryOf } from './validation.ts';

const json = (schema: z.ZodType) => ({
  content: { 'application/json': { schema: z.toJSONSchema(schema) } },
});

function operation(route: Route) {
  const input = inputOf(route.handler);
  const output = outputOf(route.handler);
  const query = queryOf(route.handler);
  const queryProperties = (query ? z.toJSONSchema(query).properties : undefined) ?? {};
  const parameters = [
    ...[...route.path.matchAll(/:(\w+)/g)].map(([, name]) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' } as unknown,
    })),
    // um parâmetro por propriedade do schema de query, todos opcionais
    ...Object.entries(queryProperties).map(([name, schema]) => ({
      name,
      in: 'query',
      required: false,
      schema: schema as unknown,
    })),
  ];
  return {
    ...(parameters.length > 0 && { parameters }),
    ...(input && { requestBody: { required: true, ...json(input) } }),
    responses: {
      [output.status ?? 200]: {
        description: 'Sucesso',
        ...(output.schema && json(output.schema)),
      },
    },
  };
}

/** Documento OpenAPI 3.1 das rotas `/api` registradas, com os schemas de `packages/contracts`. */
export function buildOpenApi(routes: Route[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes.filter(isApiRoute)) {
    const path = route.path.replace(/:(\w+)/g, '{$1}');
    (paths[path] ??= {})[route.method.toLowerCase()] = operation(route);
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Gestão de Academia', version: '1.0.0' },
    paths,
  };
}

@Controller('api')
export class OpenApiController {
  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}

  @Get('openapi.json')
  @Authenticated()
  document() {
    return buildOpenApi(listRoutes(this.discovery));
  }
}
