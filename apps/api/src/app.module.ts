import { createDatabase, type Database } from '@academia/database';
import { type DynamicModule, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { AccessDeclarations, AccessGuard } from './access.ts';
import { createAuth } from './auth.ts';
import { AuthController } from './auth/auth.controller.ts';
import { LoginThrottle } from './auth/throttle.ts';
import type { Env } from './env.ts';
import { HealthController } from './health.controller.ts';
import { OpenApiController } from './openapi.controller.ts';
import { ProblemFilter } from './problem.filter.ts';
import { AUTH, DATABASE, ENV } from './tokens.ts';
import { UsersController } from './users/users.controller.ts';
import { UsersService } from './users/users.service.ts';
import { ValidationInterceptor } from './validation.ts';

/** O `/health` tem de responder antes dos 3 s que o web espera por ele. */
const DATABASE_TIMEOUT_MS = 2000;

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [DiscoveryModule],
      controllers: [HealthController, AuthController, UsersController, OpenApiController],
      providers: [
        { provide: ENV, useValue: env },
        {
          provide: DATABASE,
          useFactory: () => createDatabase(env.DATABASE_URL, { timeoutMs: DATABASE_TIMEOUT_MS }),
        },
        {
          provide: AUTH,
          useFactory: (database: Database) =>
            createAuth(database.db, { secret: env.AUTH_SECRET, webOrigin: env.WEB_ORIGIN }),
          inject: [DATABASE],
        },
        {
          provide: UsersService,
          useFactory: (database: Database) => new UsersService(database.db),
          inject: [DATABASE],
        },
        {
          provide: LoginThrottle,
          useFactory: (database: Database) => new LoginThrottle(database.db),
          inject: [DATABASE],
        },
        AccessDeclarations,
        { provide: APP_FILTER, useClass: ProblemFilter },
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_INTERCEPTOR, useClass: ValidationInterceptor },
      ],
    };
  }

  async onApplicationShutdown() {
    await this.database.close();
  }
}
