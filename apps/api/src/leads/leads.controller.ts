import {
  type ConfirmLeadRequest,
  confirmLeadRequestSchema,
  type CreateLeadRequest,
  createLeadRequestSchema,
  type LeadConfirmedResponse,
  leadConfirmedResponseSchema,
  type LeadCreatedResponse,
  leadCreatedResponseSchema,
  type LeadOptionsResponse,
  leadOptionsResponseSchema,
} from '@academia/contracts';
import {
  type ArgumentsHost,
  Body,
  type CanActivate,
  Catch,
  Controller,
  type ExceptionFilter,
  type ExecutionContext,
  Get,
  Inject,
  Injectable,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { Input, Output } from '../validation.ts';
import { LeadsService } from './leads.service.ts';

/** O envio caiu na armadilha: responde como um envio aceito, sem ter gravado nem contado nada. */
class LeadTrapped extends Error {}

/**
 * A armadilha do formulário (door 4): `website` preenchido é de robô. A guarda roda antes da
 * validação, então mesmo um corpo inválido com a armadilha preenchida recebe o `202` de sempre.
 */
@Injectable()
class LeadTrapGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const website = (context.switchToHttp().getRequest<Request>().body as { website?: unknown } | undefined)?.website;
    if (typeof website === 'string' && website !== '') throw new LeadTrapped();
    return true;
  }
}

@Catch(LeadTrapped)
class LeadTrapFilter implements ExceptionFilter {
  catch(_exception: LeadTrapped, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(202).json({ status: 'pending' } satisfies LeadCreatedResponse);
  }
}

/** O pré-cadastro público (`/matricula`): sem sessão, sob a checagem de origem nas escritas (AD-020). */
@Controller('api/leads')
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}

  @Get('options')
  @Public()
  @Output(200, leadOptionsResponseSchema)
  options(): Promise<LeadOptionsResponse> {
    return this.leads.options();
  }

  @Post()
  @Public()
  @UseGuards(LeadTrapGuard)
  @UseFilters(LeadTrapFilter)
  @Input(createLeadRequestSchema)
  @Output(202, leadCreatedResponseSchema)
  create(@Body() body: CreateLeadRequest, @Actor() actor: AuditActor): Promise<LeadCreatedResponse> {
    return this.leads.create(body, actor);
  }

  @Post('confirm')
  @Public()
  @Input(confirmLeadRequestSchema)
  @Output(200, leadConfirmedResponseSchema)
  async confirm(@Body() body: ConfirmLeadRequest, @Actor() actor: AuditActor): Promise<LeadConfirmedResponse> {
    await this.leads.confirm(body.token, actor);
    return { status: 'confirmed' };
  }
}
