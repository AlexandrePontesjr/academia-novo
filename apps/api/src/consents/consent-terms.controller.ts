import { type ConsentTermsResponse, consentTermsResponseSchema } from '@academia/contracts';
import { Controller, Get, Inject } from '@nestjs/common';
import { Roles } from '../access.ts';
import { Output } from '../validation.ts';
import { ConsentsService } from './consents.service.ts';

/** O termo vigente de cada finalidade, para a tela mostrar o texto antes de o aceite ser registrado. */
@Controller('api/consent-terms')
export class ConsentTermsController {
  constructor(@Inject(ConsentsService) private readonly consents: ConsentsService) {}

  @Get()
  @Roles('admin', 'reception')
  @Output(200, consentTermsResponseSchema)
  async current(): Promise<ConsentTermsResponse> {
    return { items: await this.consents.currentTerms() };
  }
}
