import {
  type CreateUserRequest,
  createUserRequestSchema,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
  type UpdateUserRequest,
  updateUserRequestSchema,
  type User,
  userSchema,
  type UsersResponse,
  usersResponseSchema,
} from '@academia/contracts';
import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { Roles } from '../access.ts';
import { Actor, type AuditActor } from '../audit/audit.ts';
import { ProblemException } from '../problem.filter.ts';
import { Input, Output } from '../validation.ts';
import { UsersService } from './users.service.ts';

/** Gestão de usuários: só o Administrador (RF-03). */
@Controller('api/users')
@Roles('admin')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @Output(200, usersResponseSchema)
  async list(): Promise<UsersResponse> {
    return { users: await this.users.list() };
  }

  @Post()
  @Input(createUserRequestSchema)
  @Output(201, userSchema)
  async create(@Body() body: CreateUserRequest, @Actor() actor: AuditActor): Promise<User> {
    const user = await this.users.create(body, actor);
    if (!user) throw new ProblemException(409, 'email_taken');
    return user;
  }

  @Patch(':id')
  @Input(updateUserRequestSchema)
  @Output(200, userSchema)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserRequest,
    @Actor() actor: AuditActor,
  ): Promise<User> {
    const change = await this.users.update(id, body, actor);
    if (change.outcome === 'not_found') throw new NotFoundException();
    if (change.outcome === 'last_admin') throw new ProblemException(409, 'last_admin');
    return change.user;
  }

  @Put(':id/password')
  @Input(resetPasswordRequestSchema)
  @Output(204)
  async resetPassword(
    @Param('id') id: string,
    @Body() body: ResetPasswordRequest,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    if (!(await this.users.resetPassword(id, body.password, actor))) throw new NotFoundException();
  }

  @Delete(':id/two-factor')
  @Output(204)
  async resetTwoFactor(@Param('id') id: string, @Actor() actor: AuditActor): Promise<void> {
    if (!(await this.users.resetTwoFactor(id, actor))) throw new NotFoundException();
  }
}
