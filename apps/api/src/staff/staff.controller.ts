import { type CreateStaffRequest, createStaffRequestSchema, type Staff, staffSchema } from '@academia/contracts';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { ProblemException } from '../problem.filter.ts';
import { Input, Output } from '../validation.ts';
import { StaffService } from './staff.service.ts';

/** Cadastro de funcionários: só `admin` e `hr_finance` (RF-10); o vínculo com o usuário é só do `admin`. */
@Controller('api/staff')
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Post()
  @Roles('admin', 'hr_finance')
  @Input(createStaffRequestSchema)
  @Output(201, staffSchema)
  async create(@Body() body: CreateStaffRequest, @Actor() actor: AuditActor): Promise<Staff> {
    const created = await this.staff.create(body, actor);
    if (!created) throw new ProblemException(409, 'cpf_taken');
    return { ...created, photoUrl: null };
  }
}
