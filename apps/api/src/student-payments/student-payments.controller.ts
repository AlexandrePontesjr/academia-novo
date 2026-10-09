import {
  type CreatePaymentRequest,
  createPaymentRequestSchema,
  type OpenPaymentsQuery,
  type OpenPaymentsResponse,
  openPaymentsQuerySchema,
  openPaymentsResponseSchema,
  type RegisteredPayment,
  registeredPaymentSchema,
  type StudentPaymentsResponse,
  studentPaymentsResponseSchema,
} from '@academia/contracts';
import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { ProblemException, validationProblem } from '../problem.filter.ts';
import { Input, Output, QueryInput, ValidatedQuery } from '../validation.ts';
import { StudentPaymentsService } from './student-payments.service.ts';

/** Pagamentos de um aluno: só `admin` e `hr_finance` (PRD §2); a recepção e o instrutor não veem o que o aluno deve. */
@Controller('api/students/:id/payments')
export class StudentPaymentsController {
  constructor(@Inject(StudentPaymentsService) private readonly payments: StudentPaymentsService) {}

  @Get()
  @Roles('admin', 'hr_finance')
  @Output(200, studentPaymentsResponseSchema)
  async list(@Param('id') id: string): Promise<StudentPaymentsResponse> {
    const items = await this.payments.list(id);
    if (!items) throw new NotFoundException();
    return { items };
  }

  @Post()
  @Roles('admin', 'hr_finance')
  @Input(createPaymentRequestSchema)
  @Output(201, registeredPaymentSchema)
  async register(
    @Param('id') id: string,
    @Body() body: CreatePaymentRequest,
    @Actor() actor: AuditActor,
  ): Promise<RegisteredPayment> {
    const result = await this.payments.register(id, body, actor);
    switch (result.outcome) {
      case 'ok':
        return result.payment;
      case 'not_found':
        throw new NotFoundException();
      case 'invalid':
        throw validationProblem([{ path: result.path, message: result.message }]);
      case 'enrollment_cancelled':
      case 'payment_exceeds_balance':
        throw new ProblemException(409, result.outcome);
    }
  }

  @Delete(':paymentId')
  @Roles('admin', 'hr_finance')
  @Output(204)
  async void(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    if (!(await this.payments.void(id, paymentId, actor))) throw new NotFoundException();
  }
}

/** O que ainda falta pagar, de todos os alunos: só `admin` e `hr_finance`, e só leitura. */
@Controller('api/payments')
export class PaymentsController {
  constructor(@Inject(StudentPaymentsService) private readonly payments: StudentPaymentsService) {}

  @Get()
  @Roles('admin', 'hr_finance')
  @QueryInput(openPaymentsQuerySchema)
  @Output(200, openPaymentsResponseSchema)
  async list(@ValidatedQuery() query: OpenPaymentsQuery): Promise<OpenPaymentsResponse> {
    return { items: await this.payments.listOpen(query.status) };
  }
}
