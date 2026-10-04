import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type LoginResponse,
  loginResponseSchema,
  type PasswordConfirmationRequest,
  passwordConfirmationRequestSchema,
  type SessionResponse,
  sessionResponseSchema,
  type TwoFactorConfirmRequest,
  twoFactorConfirmRequestSchema,
  type TwoFactorEnableResponse,
  twoFactorEnableResponseSchema,
  type TwoFactorVerifyRequest,
  twoFactorVerifyRequestSchema,
} from '@academia/contracts';
import { BadRequestException, Body, Controller, Get, Inject, Post, Put, Req, Res } from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import {
  Authenticated,
  CurrentUser,
  forwardCookies,
  Public,
  twoFactorEnrollmentRequired,
} from '../access.ts';
import type { Auth } from '../auth.ts';
import { hashPassword } from '../password.ts';
import { ProblemException, validationProblem } from '../problem.filter.ts';
import { AUTH } from '../tokens.ts';
import { UsersService } from '../users/users.service.ts';
import { Input, Output } from '../validation.ts';
import { logAuth } from './auth-log.ts';
import { LoginThrottle } from './throttle.ts';

/** O Better Auth recusou a chamada (senha, código, cookie): não é falha nossa. */
const isRejection = (error: unknown): error is APIError =>
  error instanceof APIError && error.statusCode < 500;

const invalidCredentials = () => new ProblemException(401, 'invalid_credentials');
const invalidCode = () => new ProblemException(401, 'invalid_code');
const tooManyAttempts = (retryAfter: number) =>
  new ProblemException(429, 'too_many_attempts', { headers: { 'Retry-After': String(retryAfter) } });

/**
 * Rotas de autenticação. O Better Auth é chamado só por `auth.api` (AD-017); o que sai daqui segue
 * o contrato de erro e os schemas de `packages/contracts`.
 */
@Controller('api/auth')
export class AuthController {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(LoginThrottle) private readonly throttle: LoginThrottle,
  ) {}

  @Post('login')
  @Public()
  @Input(loginRequestSchema)
  @Output(200, loginResponseSchema)
  async login(
    @Body() body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const email = body.email.toLowerCase();
    const user = await this.users.findByEmail(email);
    const attempt = await this.throttle.attempt(email);
    if (!attempt.allowed) {
      logAuth(res, 'auth.login_blocked', user?.id);
      throw tooManyAttempts(attempt.retryAfter);
    }

    const signedIn = await this.signIn(email, body.password, user?.active === false, req);
    if (!signedIn || !user) {
      logAuth(res, 'auth.login_failed', user?.id);
      throw invalidCredentials();
    }

    forwardCookies(res, signedIn.headers);
    if ('twoFactorRedirect' in signedIn.response) {
      // a senha estava certa: a tentativa não conta como falha, e o contador segue para o 2º passo
      await this.throttle.forgive(email, attempt.at);
      return { status: 'two_factor_required' };
    }
    await this.throttle.reset(email);
    logAuth(res, 'auth.login_succeeded', user.id);
    return { status: 'authenticated' };
  }

  @Post('two-factor/verify')
  @Public()
  @Input(twoFactorVerifyRequestSchema)
  @Output(200, loginResponseSchema)
  async verifyTwoFactor(
    @Body() body: TwoFactorVerifyRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const user = await this.pendingLogin(req);
    if (!user) throw invalidCode();
    const attempt = await this.throttle.attempt(user.email);
    if (!attempt.allowed) {
      logAuth(res, 'auth.login_blocked', user.id);
      throw tooManyAttempts(attempt.retryAfter);
    }

    const headers = fromNodeHeaders(req.headers);
    try {
      const verified =
        body.code !== undefined
          ? await this.auth.api.verifyTOTP({ body: { code: body.code }, headers, returnHeaders: true })
          : await this.auth.api.verifyBackupCode({
              body: { code: body.backupCode ?? '' },
              headers,
              returnHeaders: true,
            });
      forwardCookies(res, verified.headers);
    } catch (error) {
      if (!isRejection(error)) throw error;
      logAuth(res, 'auth.login_failed', user.id);
      throw invalidCode();
    }
    await this.throttle.reset(user.email);
    logAuth(res, 'auth.login_succeeded', user.id);
    return { status: 'authenticated' };
  }

  @Get('session')
  @Authenticated({ duringEnrollment: true })
  @Output(200, sessionResponseSchema)
  session(@CurrentUser() user: CurrentUser): SessionResponse {
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      twoFactorEnrollmentRequired: twoFactorEnrollmentRequired(user),
    };
  }

  @Post('logout')
  @Authenticated({ duringEnrollment: true })
  @Output(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const { headers } = await this.auth.api.signOut({
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    });
    forwardCookies(res, headers);
  }

  @Put('password')
  @Authenticated()
  @Input(changePasswordRequestSchema)
  @Output(204)
  async changePassword(
    @Body() body: ChangePasswordRequest,
    @CurrentUser() user: CurrentUser,
  ): Promise<void> {
    const changed = await this.users.changeOwnPassword(user, body.currentPassword, body.newPassword);
    if (!changed) {
      throw validationProblem([{ path: 'currentPassword', message: 'Senha atual incorreta.' }]);
    }
  }

  @Post('two-factor/enable')
  @Authenticated({ duringEnrollment: true })
  @Input(passwordConfirmationRequestSchema)
  @Output(200, twoFactorEnableResponseSchema)
  async enableTwoFactor(
    @Body() body: PasswordConfirmationRequest,
    @Req() req: Request,
  ): Promise<TwoFactorEnableResponse> {
    const enabled = await this.confirmingPassword(() =>
      this.auth.api.enableTwoFactor({
        body: { password: body.password },
        headers: fromNodeHeaders(req.headers),
      }),
    );
    if (enabled.method !== 'totp') throw new BadRequestException();
    return { totpUri: enabled.totpURI, backupCodes: enabled.backupCodes };
  }

  @Post('two-factor/confirm')
  @Authenticated({ duringEnrollment: true })
  @Input(twoFactorConfirmRequestSchema)
  @Output(204)
  async confirmTwoFactor(
    @Body() body: TwoFactorConfirmRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    try {
      // a confirmação troca a sessão: o cookie novo segue na resposta
      const { headers } = await this.auth.api.verifyTOTP({
        body: { code: body.code },
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      });
      forwardCookies(res, headers);
    } catch (error) {
      if (!isRejection(error)) throw error;
      throw validationProblem([{ path: 'code', message: 'Código inválido.' }]);
    }
  }

  @Post('two-factor/disable')
  @Authenticated()
  @Input(passwordConfirmationRequestSchema)
  @Output(204)
  async disableTwoFactor(
    @Body() body: PasswordConfirmationRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { headers } = await this.confirmingPassword(() =>
      this.auth.api.disableTwoFactor({
        body: { password: body.password },
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      }),
    );
    forwardCookies(res, headers);
  }

  /** Confere a senha pelo Better Auth; `null` em qualquer recusa, sem dizer qual. */
  private async signIn(email: string, password: string, inactive: boolean, req: Request) {
    if (inactive) {
      // mesmo custo de uma senha conferida, para o tempo de resposta não denunciar a conta inativa
      await hashPassword(password);
      return null;
    }
    try {
      return await this.auth.api.signInEmail({
        body: { email, password },
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      });
    } catch (error) {
      if (!isRejection(error)) throw error;
      return null;
    }
  }

  /** O usuário do login que espera o segundo fator, pelo cookie que o primeiro passo deixou. */
  private async pendingLogin(req: Request) {
    const context = await this.auth.$context;
    const cookieName = context.createAuthCookie('two_factor').name;
    const cookie = (req.headers.cookie ?? '')
      .split(';')
      .map((pair) => pair.trim())
      .find((pair) => pair.startsWith(`${cookieName}=`));
    if (!cookie) return undefined;

    // o valor é `identificador.assinatura`; quem confere a assinatura é o Better Auth, na verificação
    const signed = decodeURIComponent(cookie.slice(cookieName.length + 1));
    const identifier = signed.slice(0, signed.lastIndexOf('.'));
    const pending = await context.internalAdapter.findVerificationValue(identifier);
    if (!pending || pending.expiresAt.getTime() <= Date.now()) return undefined;
    return this.users.findEmailById(pending.value);
  }

  /** Senha errada numa rota que a pede de novo vira erro no campo `password`. */
  private async confirmingPassword<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!isRejection(error)) throw error;
      if (error.body?.code === 'INVALID_PASSWORD') {
        throw validationProblem([{ path: 'password', message: 'Senha incorreta.' }]);
      }
      throw new BadRequestException();
    }
  }
}
