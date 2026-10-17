import { type StaffExport, staffExportSchema, type StudentExport, studentExportSchema } from '@academia/contracts';
import { Controller, Get, Header, Inject, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { ProblemException } from '../problem.filter.ts';
import { Output } from '../validation.ts';
import { PrivacyService } from './privacy.service.ts';

/**
 * A exportação e a anonimização de um aluno: só `admin` (privacidade, doors 5 e 7). Nenhuma das duas
 * lê corpo; o titular vem da URL e o autor da sessão.
 */
@Controller('api/students/:id')
@Roles('admin')
export class StudentPrivacyController {
  constructor(@Inject(PrivacyService) private readonly privacy: PrivacyService) {}

  @Get('data-export')
  @Header('Cache-Control', 'no-store')
  @Output(200, studentExportSchema)
  async export(
    @Param('id') id: string,
    @Actor() actor: AuditActor,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentExport> {
    const exported = await this.privacy.exportStudent(id, actor);
    if (!exported) throw new NotFoundException();
    res.setHeader('Content-Disposition', `attachment; filename="aluno-${exported.student.id}.json"`);
    return exported;
  }

  @Post('anonymization')
  @Output(204)
  async anonymize(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    const outcome = await this.privacy.anonymizeStudent(id, actor);
    if (outcome === 'not_found') throw new NotFoundException();
    if (outcome === 'not_inactive') throw new ProblemException(409, 'subject_not_inactive');
    if (outcome === 'open_periods') throw new ProblemException(409, 'subject_has_open_periods');
  }
}

/** A exportação e a anonimização de um funcionário: só `admin`, como as de aluno (privacidade, S4). */
@Controller('api/staff/:id')
@Roles('admin')
export class StaffPrivacyController {
  constructor(@Inject(PrivacyService) private readonly privacy: PrivacyService) {}

  @Get('data-export')
  @Header('Cache-Control', 'no-store')
  @Output(200, staffExportSchema)
  async export(
    @Param('id') id: string,
    @Actor() actor: AuditActor,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StaffExport> {
    const exported = await this.privacy.exportStaff(id, actor);
    if (!exported) throw new NotFoundException();
    res.setHeader('Content-Disposition', `attachment; filename="funcionario-${exported.staff.id}.json"`);
    return exported;
  }

  @Post('anonymization')
  @Output(204)
  async anonymize(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    const outcome = await this.privacy.anonymizeStaff(id, actor);
    if (outcome === 'not_found') throw new NotFoundException();
    if (outcome === 'not_inactive') throw new ProblemException(409, 'subject_not_inactive');
    if (outcome === 'user_linked') throw new ProblemException(409, 'staff_user_linked');
  }
}
