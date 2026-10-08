import {
  type CreateEnrollmentRequest,
  createEnrollmentRequestSchema,
  type Enrollment,
  enrollmentSchema,
  type EnrollmentsResponse,
  enrollmentsResponseSchema,
} from '@academia/contracts';
import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { ProblemException, validationProblem } from '../problem.filter.ts';
import { Input, Output } from '../validation.ts';
import { StudentEnrollmentsService } from './student-enrollments.service.ts';

/** Matrículas de um aluno: `admin` e `hr_finance` registram, renovam e cancelam (PRD §2); a recepção só lê. */
@Controller('api/students/:id/enrollments')
export class StudentEnrollmentsController {
  constructor(@Inject(StudentEnrollmentsService) private readonly enrollments: StudentEnrollmentsService) {}

  @Get()
  @Roles('admin', 'hr_finance', 'reception')
  @Output(200, enrollmentsResponseSchema)
  async list(@Param('id') id: string): Promise<EnrollmentsResponse> {
    const items = await this.enrollments.list(id);
    if (!items) throw new NotFoundException();
    return { items };
  }

  @Post()
  @Roles('admin', 'hr_finance')
  @Input(createEnrollmentRequestSchema)
  @Output(201, enrollmentSchema)
  async create(
    @Param('id') id: string,
    @Body() body: CreateEnrollmentRequest,
    @Actor() actor: AuditActor,
  ): Promise<Enrollment> {
    const result = await this.enrollments.create(id, body, actor);
    switch (result.outcome) {
      case 'ok':
        return result.enrollment;
      case 'not_found':
        throw new NotFoundException();
      case 'invalid':
        throw validationProblem([{ path: result.path, message: result.message }]);
      case 'student_inactive':
      case 'plan_inactive':
      case 'enrollment_overlap':
        throw new ProblemException(409, result.outcome);
    }
  }

  @Delete(':enrollmentId')
  @Roles('admin', 'hr_finance')
  @Output(204)
  async cancel(
    @Param('id') id: string,
    @Param('enrollmentId') enrollmentId: string,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    if (!(await this.enrollments.cancel(id, enrollmentId, actor))) throw new NotFoundException();
  }
}
