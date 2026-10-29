import {
  type ConsumePasswordTokenRequest,
  consumePasswordTokenRequestSchema,
  type FirstAccessRequest,
  firstAccessRequestSchema,
  type PasswordResetRequest,
  passwordResetRequestSchema,
} from '@academia/contracts';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Public } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { Input, Output } from '../validation.ts';
import { PortalService } from './portal.service.ts';

/**
 * O primeiro acesso do aluno (portal-aluno, S2): público, sob a checagem de origem nas escritas (AD-020).
 * A resposta é o mesmo `202` sem corpo em todo caso aceito, elegível ou não (AC 12).
 */
@Controller('api/portal')
export class PortalController {
  constructor(@Inject(PortalService) private readonly portal: PortalService) {}

  @Post('first-access')
  @Public()
  @Input(firstAccessRequestSchema)
  @Output(202)
  async firstAccess(@Body() body: FirstAccessRequest, @Actor() actor: AuditActor): Promise<void> {
    await this.portal.requestFirstAccess(body, actor);
  }
}

/** O link de senha do e-mail (door 2): o token vai no corpo, nunca no caminho. */
@Controller('api/password-tokens')
export class PasswordTokensController {
  constructor(@Inject(PortalService) private readonly portal: PortalService) {}

  @Post('consume')
  @Public()
  @Input(consumePasswordTokenRequestSchema)
  @Output(204)
  async consume(@Body() body: ConsumePasswordTokenRequest, @Actor() actor: AuditActor): Promise<void> {
    await this.portal.consume(body, actor);
  }
}

/** "Esqueci minha senha" do aluno (S4): o mesmo `202` sem corpo em todo caso aceito (AC 27). */
@Controller('api/password-reset')
export class PasswordResetController {
  constructor(@Inject(PortalService) private readonly portal: PortalService) {}

  @Post()
  @Public()
  @Input(passwordResetRequestSchema)
  @Output(202)
  async reset(@Body() body: PasswordResetRequest, @Actor() actor: AuditActor): Promise<void> {
    await this.portal.requestReset(body, actor);
  }
}
