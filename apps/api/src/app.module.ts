import { createDatabase, type Database } from '@academia/database';
import {
  type DynamicModule,
  Inject,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { Env } from './env.ts';
import { HealthController } from './health.controller.ts';
import { ProblemFilter } from './problem.filter.ts';
import { requestContext } from './request-context.ts';
import { DATABASE } from './tokens.ts';

/** O `/health` tem de responder antes dos 3 s que o web espera por ele. */
const DATABASE_TIMEOUT_MS = 2000;

@Module({})
export class AppModule implements NestModule, OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        {
          provide: DATABASE,
          useFactory: () => createDatabase(env.DATABASE_URL, { timeoutMs: DATABASE_TIMEOUT_MS }),
        },
        { provide: APP_FILTER, useClass: ProblemFilter },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestContext).forRoutes('{*path}');
  }

  async onApplicationShutdown() {
    await this.database.close();
  }
}
