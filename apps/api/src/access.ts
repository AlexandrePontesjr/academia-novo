import type { Role } from '@academia/contracts';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  type OnModuleInit,
  type Type,
  UnauthorizedException,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import type { Auth } from './auth.ts';
import { ProblemException } from './problem.filter.ts';
import { isApiRoute, listRoutes, type Route } from './routes.ts';
import { AUTH } from './tokens.ts';

/** O que uma rota declara sobre quem pode chamá-la (AD-022). */
export type Access =
  | { kind: 'public' }
  | { kind: 'authenticated'; duringEnrollment: boolean }
  | { kind: 'roles'; roles: Role[] };

const ACCESS = 'academia:access';

function declare(access: Access): MethodDecorator & ClassDecorator {
  return (target: object, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const subject = descriptor ? (descriptor.value as object) : target;
    const declared = (Reflect.getOwnMetadata(ACCESS, subject) as Access[] | undefined) ?? [];
    Reflect.defineMetadata(ACCESS, [...declared, access], subject);
  };
}

/** Rota aberta, sem sessão. */
export const Public = () => declare({ kind: 'public' });

/**
 * Rota de qualquer usuário com sessão. `duringEnrollment` marca as que o Administrador ainda sem
 * 2FA alcança: as do próprio cadastro do 2FA, a sessão e a saída.
 */
export const Authenticated = ({ duringEnrollment = false } = {}) =>
  declare({ kind: 'authenticated', duringEnrollment });

/** Rota só dos perfis listados. */
export const Roles = (...roles: Role[]) => declare({ kind: 'roles', roles });

/** As declarações de uma rota, no controller e no handler. Uma rota válida tem exatamente uma. */
export function accessOf(controller: Type, handler: object): Access[] {
  return [
    ...((Reflect.getOwnMetadata(ACCESS, controller) as Access[] | undefined) ?? []),
    ...((Reflect.getOwnMetadata(ACCESS, handler) as Access[] | undefined) ?? []),
  ];
}

export class AccessDeclarationError extends Error {
  constructor(routes: Route[]) {
    super(
      `Rotas sem exatamente uma declaração de acesso (@Public, @Authenticated ou @Roles): ${routes
        .map((route) => `${route.method} ${route.path}`)
        .join(', ')}`,
    );
  }
}

/** Impede a subida da API quando uma rota `/api` não declara acesso, ou declara mais de um. */
@Injectable()
export class AccessDeclarations implements OnModuleInit {
  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}

  onModuleInit() {
    const invalid = listRoutes(this.discovery).filter(
      (route) => isApiRoute(route) && accessOf(route.controller, route.handler).length !== 1,
    );
    if (invalid.length > 0) throw new AccessDeclarationError(invalid);
  }
}

/** O usuário e a sessão que a guarda resolveu para a requisição. */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
  sessionId: string;
}

export const twoFactorEnrollmentRequired = (user: Pick<CurrentUser, 'role' | 'twoFactorEnabled'>) =>
  user.role === 'admin' && !user.twoFactorEnabled;

/** Repassa ao navegador os `Set-Cookie` que uma chamada a `auth.api` devolveu. */
export function forwardCookies(res: Response, headers: Headers) {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) res.append('Set-Cookie', cookies);
}

/** Acesso negado por padrão: aplica a declaração de cada rota antes de o handler rodar. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declared = accessOf(context.getClass(), context.getHandler());
    const access = declared.length === 1 ? declared[0] : undefined;
    if (access?.kind === 'public') return true;

    const http = context.switchToHttp();
    const res = http.getResponse<Response>();
    // resolve a sessão pelo cookie e renova a expiração deslizante
    const { headers, response: session } = await this.auth.api.getSession({
      headers: fromNodeHeaders(http.getRequest<Request>().headers),
      returnHeaders: true,
    });
    forwardCookies(res, headers);
    if (!access || !session || !session.user.active) throw new UnauthorizedException();

    const user: CurrentUser = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role as Role,
      twoFactorEnabled: session.user.twoFactorEnabled === true,
      sessionId: session.session.id,
    };
    res.locals.currentUser = user;

    const enrolling = access.kind === 'authenticated' && access.duringEnrollment;
    if (twoFactorEnrollmentRequired(user) && !enrolling) {
      throw new ProblemException(403, 'two_factor_enrollment_required');
    }
    if (access.kind === 'roles' && !access.roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}

/** O usuário autenticado, numa rota que não é pública. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getResponse<Response>().locals.currentUser as CurrentUser,
);
