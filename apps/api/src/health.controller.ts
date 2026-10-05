import type { HealthResponse } from '@academia/contracts';
import { type Database, sql } from '@academia/database';
import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './access.ts';
import { PhotoStorage } from './photos/photo-storage.ts';
import { DATABASE } from './tokens.ts';

/** O `/health` tem de responder antes dos 3 s que o web espera por ele. */
const STORAGE_TIMEOUT_MS = 2000;

@Controller()
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PhotoStorage) private readonly storage: PhotoStorage,
  ) {}

  @Get('health')
  @Public()
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const [databaseUp, storageUp] = await Promise.all([
      this.database.db.execute(sql`select 1`).then(
        () => true,
        () => false,
      ),
      this.storage.check(STORAGE_TIMEOUT_MS),
    ]);
    const ok = databaseUp && storageUp;
    res.status(ok ? 200 : 503);
    return {
      status: ok ? 'ok' : 'degraded',
      checks: { database: databaseUp ? 'up' : 'down', storage: storageUp ? 'up' : 'down' },
    };
  }
}
