import {
  type MyPhotoResponse,
  type MyProfile,
  myPhotoResponseSchema,
  myProfileSchema,
  type PendingPhoto,
  pendingPhotoSchema,
  type PhotoQuery,
  photoQuerySchema,
  type StudentPaymentsResponse,
  studentPaymentsResponseSchema,
  type UpdateMyProfileRequest,
  updateMyProfileRequestSchema,
} from '@academia/contracts';
import { Body, Controller, Get, Inject, NotFoundException, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { readFilePart } from '../photos/photo-upload.ts';
import { PhotosService } from '../photos/photos.service.ts';
import { StudentPaymentsService } from '../student-payments/student-payments.service.ts';
import { incompleteContact } from '../students/students.controller.ts';
import { StudentsService } from '../students/students.service.ts';
import { Input, Multipart, Output, QueryInput, ValidatedQuery } from '../validation.ts';
import { PortalService } from './portal.service.ts';

/**
 * A área do aluno (S5 a S7): só o perfil `student`, e a ficha sai sempre da sessão (AC 32). Quem decide é
 * o serviço de cada assunto, o mesmo que a equipe usa.
 */
@Controller('api/me')
export class MeController {
  constructor(
    @Inject(PortalService) private readonly portal: PortalService,
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(StudentPaymentsService) private readonly payments: StudentPaymentsService,
    @Inject(PhotosService) private readonly photos: PhotosService,
  ) {}

  @Get('profile')
  @Roles('student')
  @Output(200, myProfileSchema)
  async profile(@CurrentUser() user: CurrentUser): Promise<MyProfile> {
    return this.profileOf(await this.portal.studentIdOf(user.id));
  }

  @Patch('profile')
  @Roles('student')
  @Input(updateMyProfileRequestSchema)
  @Output(200, myProfileSchema)
  async update(
    @Body() body: UpdateMyProfileRequest,
    @CurrentUser() user: CurrentUser,
    @Actor() actor: AuditActor,
  ): Promise<MyProfile> {
    const studentId = await this.portal.studentIdOf(user.id);
    const change = await this.students.update(studentId, body, actor);
    if (change.outcome === 'incomplete_contact') throw incompleteContact(change.missing);
    if (change.outcome !== 'ok') throw new NotFoundException();
    return this.profileOf(studentId);
  }

  @Get('payments')
  @Roles('student')
  @Output(200, studentPaymentsResponseSchema)
  async listPayments(@CurrentUser() user: CurrentUser): Promise<StudentPaymentsResponse> {
    const items = await this.payments.list(await this.portal.studentIdOf(user.id));
    if (!items) throw new NotFoundException();
    return { items };
  }

  @Get('photo')
  @Roles('student')
  @QueryInput(photoQuerySchema)
  @Output(200, myPhotoResponseSchema)
  async photo(@ValidatedQuery() query: PhotoQuery, @CurrentUser() user: CurrentUser): Promise<MyPhotoResponse> {
    const urls = await this.photos.ownUrls(await this.portal.studentIdOf(user.id), query.variant ?? 'medium');
    if (!urls) throw new NotFoundException();
    return urls;
  }

  @Post('photo')
  @Roles('student')
  @Multipart()
  @Output(201, pendingPhotoSchema)
  async upload(@Req() req: Request, @CurrentUser() user: CurrentUser, @Actor() actor: AuditActor): Promise<PendingPhoto> {
    const target = await this.photos.findStudent(await this.portal.studentIdOf(user.id));
    if (!target) throw new NotFoundException();
    return this.photos.submit(target, await readFilePart(req), actor);
  }

  private async profileOf(studentId: string): Promise<MyProfile> {
    const student = await this.students.find(studentId, false);
    if (!student) throw new NotFoundException();
    const photoUrl = (await this.photos.photoUrls([studentId], 'medium')).get(studentId) ?? null;
    return {
      name: student.name,
      cpf: student.cpf!,
      birthDate: student.birthDate!,
      email: student.email ?? null,
      phone: student.phone!,
      address: student.address ?? null,
      emergencyContactName: student.emergencyContactName ?? null,
      emergencyContactPhone: student.emergencyContactPhone ?? null,
      status: student.status,
      photoUrl,
      pendingPhoto: await this.photos.pendingOf(studentId),
    };
  }
}
