import {
  type CreatePlanRequest,
  createPlanRequestSchema,
  type Plan,
  planSchema,
  type PlansResponse,
  plansResponseSchema,
  type UpdatePlanRequest,
  updatePlanRequestSchema,
} from '@academia/contracts';
import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post } from '@nestjs/common';
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

  @Patch(':id')
  @Roles('admin', 'hr_finance')
  @Input(updatePlanRequestSchema)
  @Output(200, planSchema)
  async update(@Param('id') id: string, @Body() body: UpdatePlanRequest, @Actor() actor: AuditActor): Promise<Plan> {
    const updated = await this.plans.update(id, body, actor);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Delete(':id')
  @Roles('admin', 'hr_finance')
  @Output(204)
  async inactivate(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    if (!(await this.plans.inactivate(id, actor))) throw new NotFoundException();
  }
}
