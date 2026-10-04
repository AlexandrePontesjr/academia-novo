import {
  type AuditLogsQuery,
  auditLogsQuerySchema,
  type AuditLogsResponse,
  auditLogsResponseSchema,
} from '@academia/contracts';
import { Controller, Get, Inject } from '@nestjs/common';
import { Roles } from '../access.ts';
import { validationProblem } from '../problem.filter.ts';
import { Output, QueryInput, ValidatedQuery } from '../validation.ts';
import { AuditLogsService } from './audit-logs.service.ts';

/** Consulta da trilha de auditoria: só o Administrador, e só leitura (RF-26). */
@Controller('api/audit-logs')
@Roles('admin')
export class AuditLogsController {
  constructor(@Inject(AuditLogsService) private readonly auditLogs: AuditLogsService) {}

  @Get()
  @QueryInput(auditLogsQuerySchema)
  @Output(200, auditLogsResponseSchema)
  async list(@ValidatedQuery() query: AuditLogsQuery): Promise<AuditLogsResponse> {
    const page = await this.auditLogs.list(query);
    // um uuid que não é de linha nenhuma não é um cursor que a API emitiu
    if (!page) throw validationProblem([{ path: 'cursor', message: 'Cursor inválido.' }]);
    return page;
  }
}
