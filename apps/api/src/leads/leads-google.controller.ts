import { type LeadGoogleProfile, leadGoogleProfileSchema } from '@academia/contracts';
import { Controller, Get, Inject, NotFoundException, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../access.ts';
import type { Env } from '../env.ts';
import { ENV } from '../tokens.ts';
import { Output } from '../validation.ts';
import {
  codeChallenge,
  cookieOptions,
  cookieValue,
  decodeIdToken,
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_TOKEN_URL,
  googleClient,
  PROFILE_COOKIE,
  PROFILE_TTL_SECONDS,
  profileFromClaims,
  profileOf,
  randomToken,
  signCookie,
  STATE_COOKIE,
  STATE_TTL_SECONDS,
  verifyCookie,
} from './lead-google.ts';
import type { GoogleProfile } from './leads.service.ts';

/** Quanto o callback espera pelo endpoint de token do Google. */
const GOOGLE_TIMEOUT_MS = 5000;

/**
 * Entrar com Google no pré-cadastro (door 7), por redirect no servidor: o navegador vai ao Google com
 * `state` e PKCE guardados num cookie assinado, volta ao callback, e o perfil confirmado fica em outro
 * cookie assinado até o envio do formulário. Sem `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, `404`.
 */
@Controller('api/leads/google')
export class LeadsGoogleController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get('start')
  @Public()
  @Output(302)
  start(@Res({ passthrough: true }) res: Response): void {
    const { clientId } = this.client();
    const state = randomToken();
    const verifier = randomToken();
    res.cookie(STATE_COOKIE, signCookie({ state, verifier }, this.env.AUTH_SECRET, STATE_TTL_SECONDS), {
      ...cookieOptions(this.env, '/api/leads/google'),
      maxAge: STATE_TTL_SECONDS * 1000,
    });
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    res.location(`${GOOGLE_AUTHORIZE_URL}?${query}`);
  }

  @Get('callback')
  @Public()
  @Output(302)
  async callback(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const client = this.client();
    const stateCookie = verifyCookie(cookieValue(req.headers.cookie, STATE_COOKIE), this.env.AUTH_SECRET);
    // o estado serve a uma volta só, dê ela certo ou não
    res.cookie(STATE_COOKIE, '', { ...cookieOptions(this.env, '/api/leads/google'), maxAge: 0 });

    const profile = await this.exchange(req.query, stateCookie, client);
    if (!profile) {
      res.location('/matricula?google=erro');
      return;
    }
    res.cookie(PROFILE_COOKIE, signCookie({ ...profile }, this.env.AUTH_SECRET, PROFILE_TTL_SECONDS), {
      ...cookieOptions(this.env, '/api/leads'),
      maxAge: PROFILE_TTL_SECONDS * 1000,
    });
    res.location('/matricula?google=ok');
  }

  @Get('profile')
  @Public()
  @Output(200, leadGoogleProfileSchema)
  profile(@Req() req: Request): LeadGoogleProfile {
    this.client();
    const profile = profileOf(req, this.env.AUTH_SECRET);
    if (!profile) throw new NotFoundException();
    return profile;
  }

  /** Troca o `code` pelo `id_token` e o confere; qualquer desvio é `undefined`, nunca uma exceção. */
  private async exchange(
    query: Request['query'],
    stateCookie: Record<string, unknown> | undefined,
    client: { clientId: string; clientSecret: string },
  ): Promise<GoogleProfile | undefined> {
    const { code, state, error } = query;
    if (error !== undefined || typeof code !== 'string' || typeof state !== 'string') return undefined;
    if (!stateCookie || stateCookie.state !== state || typeof stateCookie.verifier !== 'string') return undefined;
    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: stateCookie.verifier,
          client_id: client.clientId,
          client_secret: client.clientSecret,
          redirect_uri: this.redirectUri(),
        }),
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const { id_token: idToken } = (await response.json()) as { id_token?: unknown };
      const claims = decodeIdToken(idToken);
      return claims && profileFromClaims(claims, client.clientId);
    } catch {
      return undefined;
    }
  }

  private client() {
    const client = googleClient(this.env);
    if (!client) throw new NotFoundException();
    return client;
  }

  private redirectUri() {
    return `${new URL(this.env.WEB_ORIGIN).origin}/api/leads/google/callback`;
  }
}
