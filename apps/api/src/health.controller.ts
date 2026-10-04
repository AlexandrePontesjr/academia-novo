import type { HealthResponse } from '@academia/contracts';
import { type Database, sql } from '@academia/database';
import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DATABASE } from './tokens.ts';

@Controller()
export class HealthController {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  @Get('health')
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const databaseUp = await this.database.db.execute(sql`select 1`).then(
      () => true,
      () => false,
    );
    res.status(databaseUp ? 200 : 503);
    return {
      status: databaseUp ? 'ok' : 'degraded',
      checks: { database: databaseUp ? 'up' : 'down' },
    };
  }
}
