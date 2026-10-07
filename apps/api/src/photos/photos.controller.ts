import {
  type PhotoCreated,
  type PhotoFileQuery,
  type PhotoQuery,
  type PhotoUrlResponse,
  photoCreatedSchema,
  photoFileQuerySchema,
  photoQuerySchema,
  photoUrlResponseSchema,
} from '@academia/contracts';
import { Controller, Delete, Get, Header, Inject, NotFoundException, Param, Post, Put, Req, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { Public, Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { ProblemException } from '../problem.filter.ts';
import { Multipart, Output, QueryInput, ValidatedQuery } from '../validation.ts';
import { isPhotoVariant } from './photo-keys.ts';
import { readFilePart } from './photo-upload.ts';
import { PhotosService } from './photos.service.ts';

const ALL = ['admin', 'reception', 'hr_finance', 'instructor'] as const;

/**
 * A foto do aluno (door 7: o processamento é síncrono, dentro da requisição). `admin` e `reception`
 * enviam, trocam e removem; os quatro perfis pedem a URL, e a entrega do arquivo é aberta porque a
 * assinatura é a credencial (door 4). A do funcionário usa o mesmo pipeline nas rotas `staff/:id/photo`.
 */
@Controller('api')
export class PhotosController {
  constructor(@Inject(PhotosService) private readonly photos: PhotosService) {}

  @Post('students/:id/photo')
  @Roles('admin', 'reception')
  @Multipart()
  @Output(201, photoCreatedSchema)
  async upload(@Param('id') id: string, @Req() req: Request, @Actor() actor: AuditActor): Promise<PhotoCreated> {
    const target = await this.photos.findStudent(id);
    if (!target) throw new NotFoundException();
    const file = await readFilePart(req);
    return this.photos.create(target, file, actor);
  }

  /** A troca (foto-captura, door 2): mesmo corpo e mesma resposta do `POST`. */
  @Put('students/:id/photo')
  @Roles('admin', 'reception')
  @Multipart()
  @Output(201, photoCreatedSchema)
  async replace(@Param('id') id: string, @Req() req: Request, @Actor() actor: AuditActor): Promise<PhotoCreated> {
    const target = await this.photos.findStudent(id);
    if (!target) throw new NotFoundException();
    const file = await readFilePart(req);
    return this.photos.replace(target, file, actor);
  }

  @Get('students/:id/photo')
  @Roles(...ALL)
  @QueryInput(photoQuerySchema)
  @Output(200, photoUrlResponseSchema)
  async url(@Param('id') id: string, @ValidatedQuery() query: PhotoQuery): Promise<PhotoUrlResponse> {
    const target = await this.photos.findStudent(id);
    const url = target && (await this.photos.urlFor(target.id, query.variant ?? 'medium'));
    if (!url) throw new NotFoundException();
    return url;
  }

  @Delete('students/:id/photo')
  @Roles('admin', 'reception')
  @Output(204)
  async remove(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    const target = await this.photos.findStudent(id);
    if (!target) throw new NotFoundException();
    await this.photos.remove(target, actor);
  }

  /** A foto do funcionário (funcionarios, door 2): o mesmo pipeline, com `admin` e `hr_finance` (RF-10). */
  @Post('staff/:id/photo')
  @Roles('admin', 'hr_finance')
  @Multipart()
  @Output(201, photoCreatedSchema)
  async uploadStaff(@Param('id') id: string, @Req() req: Request, @Actor() actor: AuditActor): Promise<PhotoCreated> {
    const target = await this.photos.findStaff(id);
    if (!target) throw new NotFoundException();
    const file = await readFilePart(req);
    return this.photos.create(target, file, actor);
  }

  @Put('staff/:id/photo')
  @Roles('admin', 'hr_finance')
  @Multipart()
  @Output(201, photoCreatedSchema)
  async replaceStaff(@Param('id') id: string, @Req() req: Request, @Actor() actor: AuditActor): Promise<PhotoCreated> {
    const target = await this.photos.findStaff(id);
    if (!target) throw new NotFoundException();
    const file = await readFilePart(req);
    return this.photos.replace(target, file, actor);
  }

  @Delete('staff/:id/photo')
  @Roles('admin', 'hr_finance')
  @Output(204)
  async removeStaff(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    const target = await this.photos.findStaff(id);
    if (!target) throw new NotFoundException();
    await this.photos.remove(target, actor);
  }

  @Get('photo-files/:photoId/:variant')
  @Public()
  @Header('Cache-Control', 'no-store')
  @QueryInput(photoFileQuerySchema)
  @Output(200)
  async file(
    @Param('photoId') photoId: string,
    @Param('variant') variant: string,
    @ValidatedQuery() query: PhotoFileQuery,
  ): Promise<StreamableFile> {
    // a assinatura é conferida antes de qualquer consulta: foto que nunca existiu também é `403`
    if (!isPhotoVariant(variant) || !this.photos.isSigned(photoId, variant, query.exp, query.sig)) {
      throw new ProblemException(403, 'invalid_signature');
    }
    const bytes = await this.photos.fileOf(photoId, variant);
    if (!bytes) throw new NotFoundException();
    return new StreamableFile(bytes, { type: 'image/webp', length: bytes.length });
  }
}
