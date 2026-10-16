import {
  type CheckInsReport,
  type CheckInsReportQuery,
  checkInsReportQuerySchema,
  checkInsReportSchema,
  type CheckInStatus,
  checkInStatusSchema,
  type RegisteredCheckIn,
  registeredCheckInSchema,
  type StudentCheckInsQuery,
  studentCheckInsQuerySchema,
  type StudentCheckInsResponse,
  studentCheckInsResponseSchema,
} from '@academia/contracts';
import { Controller, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../access.ts';
import { ProblemException, validationProblem } from '../problem.filter.ts';
import { Output, QueryInput, ValidatedQuery } from '../validation.ts';
import { CheckInsService } from './check-ins.service.ts';

/**
 * O balcão e o histórico de um aluno: só `admin` e `reception`, quem registra presença (PRD §2). O
 * `POST` não lê corpo: o aluno vem da URL, o dia do relógio da API e o autor da sessão.
 */
@Controller('api/students/:id')
@Roles('admin', 'reception')
export class StudentCheckInsController {
  constructor(@Inject(CheckInsService) private readonly checkIns: CheckInsService) {}

  @Get('check-in-status')
  @Output(200, checkInStatusSchema)
  async status(@Param('id') id: string): Promise<CheckInStatus> {
    const status = await this.checkIns.status(id);
    if (!status) throw new NotFoundException();
    return status;
  }

  @Post('check-ins')
  @Output(201, registeredCheckInSchema)
  async register(@Param('id') id: string, @CurrentUser() user: CurrentUser): Promise<RegisteredCheckIn> {
    const result = await this.checkIns.register(id, user.id);
    switch (result.outcome) {
      case 'ok':
        return result.checkIn;
      case 'not_found':
        throw new NotFoundException();
      case 'check_in_blocked':
      case 'already_checked_in':
        throw new ProblemException(409, result.outcome);
    }
  }

  @Get('check-ins')
  @QueryInput(studentCheckInsQuerySchema)
  @Output(200, studentCheckInsResponseSchema)
  async history(@Param('id') id: string, @ValidatedQuery() query: StudentCheckInsQuery): Promise<StudentCheckInsResponse> {
    const page = await this.checkIns.history(id, query.cursor);
    if (page === undefined) throw new NotFoundException();
    // um `id` que não é de presença deste aluno não é um cursor que a rota emitiu
    if (page === null) throw validationProblem([{ path: 'cursor', message: 'Cursor inválido.' }]);
    return page;
  }
}

/** O relatório de presenças por período: só `admin` e `reception`, e só leitura. */
@Controller('api/check-ins')
@Roles('admin', 'reception')
export class CheckInsController {
  constructor(@Inject(CheckInsService) private readonly checkIns: CheckInsService) {}

  @Get()
  @QueryInput(checkInsReportQuerySchema)
  @Output(200, checkInsReportSchema)
  async report(@ValidatedQuery() query: CheckInsReportQuery): Promise<CheckInsReport> {
    const report = await this.checkIns.report(query);
    if ('path' in report) throw validationProblem([report]);
    return report;
  }
}
