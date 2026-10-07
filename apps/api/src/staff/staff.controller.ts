import {
  type CreateStaffRequest,
  createStaffRequestSchema,
  type LinkStaffUserRequest,
  linkStaffUserRequestSchema,
  type UpdateStaffRequest,
  updateStaffRequestSchema,
  type Staff,
  staffListResponseSchema,
  type StaffListResponse,
  staffSchema,
} from '@academia/contracts';
import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { PhotosService } from '../photos/photos.service.ts';
import { ProblemException, validationProblem } from '../problem.filter.ts';
import { Input, Output } from '../validation.ts';
import { StaffService } from './staff.service.ts';

/** Cadastro de funcionários: só `admin` e `hr_finance` (RF-10); o vínculo com o usuário é só do `admin`. */
@Controller('api/staff')
export class StaffController {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(PhotosService) private readonly photos: PhotosService,
  ) {}

  @Get()
  @Roles('admin', 'hr_finance')
  @Output(200, staffListResponseSchema)
  async list(@Actor() actor: AuditActor): Promise<StaffListResponse> {
    const rows = await this.staff.list(actor);
    const photoUrls = await this.photos.staffPhotoUrls(rows.map((row) => row.id), 'thumb');
    return { items: rows.map((row) => ({ ...row, photoUrl: photoUrls.get(row.id) ?? null })) };
  }

  @Post()
  @Roles('admin', 'hr_finance')
  @Input(createStaffRequestSchema)
  @Output(201, staffSchema)
  async create(@Body() body: CreateStaffRequest, @Actor() actor: AuditActor): Promise<Staff> {
    const created = await this.staff.create(body, actor);
    if (!created) throw new ProblemException(409, 'cpf_taken');
    return { ...created, photoUrl: null };
  }

  @Get(':id')
  @Roles('admin', 'hr_finance')
  @Output(200, staffSchema)
  async get(@Param('id') id: string, @Actor() actor: AuditActor): Promise<Staff> {
    const found = await this.staff.find(id, actor);
    if (!found) throw new NotFoundException();
    const photoUrl = (await this.photos.staffPhotoUrls([found.id], 'medium')).get(found.id) ?? null;
    return { ...found, photoUrl };
  }

  @Patch(':id')
  @Roles('admin', 'hr_finance')
  @Input(updateStaffRequestSchema)
  @Output(200, staffSchema)
  async update(@Param('id') id: string, @Body() body: UpdateStaffRequest, @Actor() actor: AuditActor): Promise<Staff> {
    const change = await this.staff.update(id, body, actor);
    if (change.outcome === 'not_found') throw new NotFoundException();
    if (change.outcome === 'cpf_taken') throw new ProblemException(409, 'cpf_taken');
    const photoUrl = (await this.photos.staffPhotoUrls([id], 'medium')).get(id) ?? null;
    return { ...change.staff, photoUrl };
  }

  @Delete(':id')
  @Roles('admin', 'hr_finance')
  @Output(204)
  async inactivate(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    if (!(await this.staff.inactivate(id, actor))) throw new NotFoundException();
  }

  @Put(':id/user')
  @Roles('admin')
  @Input(linkStaffUserRequestSchema)
  @Output(204)
  async link(@Param('id') id: string, @Body() body: LinkStaffUserRequest, @Actor() actor: AuditActor): Promise<void> {
    const outcome = await this.staff.link(id, body.userId, actor);
    if (outcome === 'not_found') throw new NotFoundException();
    if (outcome === 'user_unknown') throw validationProblem([{ path: 'userId', message: 'Escolha um usuário válido.' }]);
    if (outcome === 'user_already_linked') throw new ProblemException(409, 'user_already_linked');
  }

  @Delete(':id/user')
  @Roles('admin')
  @Output(204)
  async unlink(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    if (!(await this.staff.unlink(id, actor))) throw new NotFoundException();
  }
}
