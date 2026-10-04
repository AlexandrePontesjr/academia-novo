import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import type { DiscoveryService } from '@nestjs/core';

export interface Route {
  /** `GET`, `POST`... */
  method: string;
  /** Caminho completo, com os parâmetros na forma `:id`. */
  path: string;
  controller: Type;
  handler: object;
}

const segments = (path: unknown) =>
  String(path ?? '')
    .split('/')
    .filter(Boolean);

/** Toda rota declarada nos controllers da aplicação em execução. */
export function listRoutes(discovery: DiscoveryService): Route[] {
  return discovery.getControllers().flatMap(({ metatype }) => {
    const controller = metatype as Type;
    const prototype = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(prototype)
      .map((name) => prototype[name])
      .filter(
        (handler): handler is object =>
          typeof handler === 'function' && Reflect.hasMetadata(METHOD_METADATA, handler),
      )
      .map((handler) => ({
        method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod],
        path: `/${[
          ...segments(Reflect.getMetadata(PATH_METADATA, controller)),
          ...segments(Reflect.getMetadata(PATH_METADATA, handler)),
        ].join('/')}`,
        controller,
        handler,
      }));
  });
}

export const isApiRoute = (route: Route) => route.path === '/api' || route.path.startsWith('/api/');
