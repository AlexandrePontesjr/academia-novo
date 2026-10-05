import {
  type CreateStudentRequest,
  createStudentRequestSchema,
  type Student,
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
import { ProblemException, validationProblem } from '../problem.filter.ts';
import { Input, Output, QueryInput, ValidatedQuery } from '../validation.ts';
import { StudentsService } from './students.service.ts';
import { seesHealthNotes, viewListItem, viewStudent } from './students.view.ts';

const ALL = ['admin', 'reception', 'hr_finance', 'instructor'] as const;

/** Cadastro de alunos: `admin` e `reception` escrevem; os quatro perfis leem, cada um com os seus campos (door 4). */
@Controller('api/students')
export class StudentsController {
  constructor(
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(PhotosService) private readonly photos: PhotosService,
  ) {}

  @Get()
  @Roles(...ALL)
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
    const student = await this.students.create(body, actor);
    if (!student) throw new ProblemException(409, 'cpf_taken');
    return student;
  }

  @Get(':id')
  @Roles(...ALL)
  @Output(200, studentSchema)
  async get(@Param('id') id: string, @CurrentUser() user: CurrentUser): Promise<Student> {
    const student = await this.students.find(id, seesHealthNotes(user.role));
    if (!student) throw new NotFoundException();
    const photoUrl = (await this.photos.photoUrls([student.id], 'medium')).get(student.id) ?? null;
    return viewStudent(user.role, { ...student, photoUrl });
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
    if (change.outcome === 'cpf_taken') throw new ProblemException(409, 'cpf_taken');
    if (change.outcome === 'guardian_required') {
      throw validationProblem([{ path: 'guardian', message: 'Informe o responsável legal do aluno menor de 18 anos.' }]);
    }
    if (change.outcome === 'guardian_cpf_is_students') {
      throw validationProblem([{ path: 'guardian.cpf', message: 'O CPF do responsável deve ser diferente do CPF do aluno.' }]);
    }
    if (change.outcome === 'incomplete_contact') {
      throw validationProblem([
        {
          path: change.missing,
          message:
            change.missing === 'emergencyContactName'
              ? 'Informe o nome do contato de emergência.'
              : 'Informe o telefone do contato de emergência.',
        },
      ]);
    }
    return change.student;
  }

  @Delete(':id')
  @Roles('admin', 'reception')
  @Output(204)
  async inactivate(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    if (!(await this.students.inactivate(id, actor))) throw new NotFoundException();
  }
}
