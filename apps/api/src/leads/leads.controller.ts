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
  type Lead,
  leadSchema,
  type LeadsQuery,
  leadsQuerySchema,
  type LeadsResponse,
  leadsResponseSchema,
  type UpdateLeadRequest,
  updateLeadRequestSchema,
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
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public, Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import type { Env } from '../env.ts';
import { ENV } from '../tokens.ts';
import { ProblemException } from '../problem.filter.ts';
import { Input, Output, QueryInput, ValidatedQuery } from '../validation.ts';
import { cookieOptions, googleClient, PROFILE_COOKIE, profileOf } from './lead-google.ts';
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

/**
 * O pré-cadastro público (`/matricula`): sem sessão, sob a checagem de origem nas escritas (AD-020).
 * A lista e a mudança de situação são da equipe que atende: `admin`, `reception` e `hr_finance`.
 */
@Controller('api/leads')
export class LeadsController {
  constructor(
    @Inject(LeadsService) private readonly leads: LeadsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

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
  async create(
    @Body() body: CreateLeadRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Actor() actor: AuditActor,
  ): Promise<LeadCreatedResponse> {
    // com o perfil do Google no cookie, nome e e-mail são os dele, e o cookie serve a um envio só
    const google = googleClient(this.env) ? profileOf(req, this.env.AUTH_SECRET) : undefined;
    const created = await this.leads.create(body, actor, google);
    if (google) res.cookie(PROFILE_COOKIE, '', { ...cookieOptions(this.env, '/api/leads'), maxAge: 0 });
    return created;
  }

  @Get()
  @Roles('admin', 'reception', 'hr_finance')
  @QueryInput(leadsQuerySchema)
  @Output(200, leadsResponseSchema)
  async list(@ValidatedQuery() query: LeadsQuery): Promise<LeadsResponse> {
    return { items: await this.leads.list(query.status) };
  }

  @Patch(':id')
  @Roles('admin', 'reception', 'hr_finance')
  @Input(updateLeadRequestSchema)
  @Output(200, leadSchema)
  async update(@Param('id') id: string, @Body() body: UpdateLeadRequest, @Actor() actor: AuditActor): Promise<Lead> {
    const change = await this.leads.update(id, body, actor);
    if (change.outcome === 'not_found') throw new NotFoundException();
    if (change.outcome !== 'ok') throw new ProblemException(409, change.outcome);
    return change.lead;
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
