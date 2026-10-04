import {
  type Consent,
  consentSchema,
  type GrantConsentRequest,
  grantConsentRequestSchema,
  type StudentConsentsResponse,
  studentConsentsResponseSchema,
} from '@academia/contracts';
import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { ProblemException, validationProblem } from '../problem.filter.ts';
import { Input, Output } from '../validation.ts';
import { ConsentsService } from './consents.service.ts';

/** Consentimentos de um aluno: `admin` e `reception` leem, concedem e revogam. */
@Controller('api/students/:id/consents')
export class ConsentsController {
  constructor(@Inject(ConsentsService) private readonly consents: ConsentsService) {}

  @Get()
  @Roles('admin', 'reception')
  @Output(200, studentConsentsResponseSchema)
  async ficha(@Param('id') id: string): Promise<StudentConsentsResponse> {
    const ficha = await this.consents.ficha(id);
    if (!ficha) throw new NotFoundException();
    return ficha;
  }

  @Post()
  @Roles('admin', 'reception')
  @Input(grantConsentRequestSchema)
  @Output(201, consentSchema)
  async grant(@Param('id') id: string, @Body() body: GrantConsentRequest, @Actor() actor: AuditActor): Promise<Consent> {
    const result = await this.consents.grant(id, body, actor);
    switch (result.outcome) {
      case 'ok':
        return result.consent;
      case 'not_found':
        throw new NotFoundException();
      case 'invalid':
        throw validationProblem([{ path: result.path, message: result.message }]);
      case 'term_outdated':
        throw new ProblemException(409, 'consent_term_outdated');
      case 'consent_active':
        throw new ProblemException(409, 'consent_active');
    }
  }

  @Delete(':consentId')
  @Roles('admin', 'reception')
  @Output(204)
  async revoke(
    @Param('id') id: string,
    @Param('consentId') consentId: string,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    if (!(await this.consents.revoke(id, consentId, actor))) throw new NotFoundException();
  }
}
