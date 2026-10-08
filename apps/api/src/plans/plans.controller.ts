import {
  type CreatePlanRequest,
  createPlanRequestSchema,
  type Plan,
  planSchema,
  type PlansResponse,
  plansResponseSchema,
} from '@academia/contracts';
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { Input, Output } from '../validation.ts';
import { PlansService } from './plans.service.ts';

/** Planos da academia: `admin` e `hr_finance` escrevem (PRD §2); a recepção só lê a tabela de preços. */
@Controller('api/plans')
export class PlansController {
  constructor(@Inject(PlansService) private readonly plans: PlansService) {}

  @Get()
  @Roles('admin', 'hr_finance', 'reception')
  @Output(200, plansResponseSchema)
  async list(): Promise<PlansResponse> {
    return { items: await this.plans.list() };
  }

  @Post()
  @Roles('admin', 'hr_finance')
  @Input(createPlanRequestSchema)
  @Output(201, planSchema)
  create(@Body() body: CreatePlanRequest, @Actor() actor: AuditActor): Promise<Plan> {
    return this.plans.create(body, actor);
  }
}
