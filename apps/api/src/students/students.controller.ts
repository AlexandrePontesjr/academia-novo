import {
  type CreateStudentRequest,
  createStudentRequestSchema,
  STAFF_ROLES,
  type Student,
  type StudentDetail,
  studentDetailSchema,
  studentSchema,
  type StudentsQuery,
  type StudentsResponse,
  studentsQuerySchema,
  studentsResponseSchema,
  type UpdateStudentRequest,
  updateStudentRequestSchema,
} from '@academia/contracts';
import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { PhotosService } from '../photos/photos.service.ts';
import { PortalService } from '../portal/portal.service.ts';
import { ProblemException, validationProblem } from '../problem.filter.ts';
import { Input, Output, QueryInput, ValidatedQuery } from '../validation.ts';
import { StudentsService } from './students.service.ts';
import { seesHealthNotes, viewListItem, viewStudent } from './students.view.ts';

/** A recusa do par do contato de emergência, que depende do que já está gravado. */
export const incompleteContact = (missing: 'emergencyContactName' | 'emergencyContactPhone') =>
  validationProblem([
    {
      path: missing,
      message: missing === 'emergencyContactName' ? 'Informe o nome do contato de emergência.' : 'Informe o telefone do contato de emergência.',
    },
  ]);

/** Cadastro de alunos: `admin` e `reception` escrevem; os quatro perfis leem, cada um com os seus campos (door 4). */
@Controller('api/students')
export class StudentsController {
  constructor(
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(PhotosService) private readonly photos: PhotosService,
    @Inject(PortalService) private readonly portal: PortalService,
  ) {}

  @Get()
  @Roles(...STAFF_ROLES)
  @QueryInput(studentsQuerySchema)
  @Output(200, studentsResponseSchema)
  async list(@ValidatedQuery() query: StudentsQuery, @CurrentUser() user: CurrentUser): Promise<StudentsResponse> {
    const { rows, nextCursor } = await this.students.list(query, user.role);
    // `null` é "sem foto": a chave existe para os quatro perfis (door 4 de `alunos`, foto-pipeline)
    const photoUrls = await this.photos.photoUrls(rows.map((row) => row.id), 'thumb');
    return {
      items: rows.map((row) => viewListItem(user.role, { ...row, photoUrl: photoUrls.get(row.id) ?? null })),
      nextCursor,
    };
  }

  @Post()
  @Roles('admin', 'reception')
  @Input(createStudentRequestSchema)
  @Output(201, studentSchema)
  async create(@Body() body: CreateStudentRequest, @Actor() actor: AuditActor): Promise<Student> {
    const created = await this.students.create(body, actor);
    if (created.outcome === 'lead_not_found') {
      throw validationProblem([{ path: 'leadId', message: 'Interessado não encontrado.' }]);
    }
    if (created.outcome !== 'ok') throw new ProblemException(409, created.outcome);
    return created.student;
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  @Output(200, studentDetailSchema)
  async get(@Param('id') id: string, @CurrentUser() user: CurrentUser): Promise<StudentDetail> {
    const student = await this.students.find(id, seesHealthNotes(user.role));
    if (!student) throw new NotFoundException();
    const photoUrl = (await this.photos.photoUrls([student.id], 'medium')).get(student.id) ?? null;
    // o estado do portal e a foto pendente vão aos quatro perfis (decisão do usuário em 2026-10-28)
    return {
      ...viewStudent(user.role, { ...student, photoUrl }),
      portal: await this.portal.portalOf(student.id),
      pendingPhoto: await this.photos.pendingOf(student.id),
    };
  }

  @Patch(':id')
  @Roles('admin', 'reception')
  @Input(updateStudentRequestSchema)
  @Output(200, studentSchema)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateStudentRequest,
    @Actor() actor: AuditActor,
  ): Promise<Student> {
    const change = await this.students.update(id, body, actor);
    if (change.outcome === 'not_found') throw new NotFoundException();
    if (change.outcome === 'cpf_taken' || change.outcome === 'email_in_use') throw new ProblemException(409, change.outcome);
    if (change.outcome === 'guardian_required') {
      throw validationProblem([{ path: 'guardian', message: 'Informe o responsável legal do aluno menor de 18 anos.' }]);
    }
    if (change.outcome === 'guardian_cpf_is_students') {
      throw validationProblem([{ path: 'guardian.cpf', message: 'O CPF do responsável deve ser diferente do CPF do aluno.' }]);
    }
    if (change.outcome === 'incomplete_contact') throw incompleteContact(change.missing);
    return change.student;
  }

  @Delete(':id')
  @Roles('admin', 'reception')
  @Output(204)
  async inactivate(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    if (!(await this.students.inactivate(id, actor))) throw new NotFoundException();
  }
}
