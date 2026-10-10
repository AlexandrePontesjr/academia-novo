import { type DashboardResponse, dashboardResponseSchema } from '@academia/contracts';
import { Controller, Get, Inject } from '@nestjs/common';
import { CurrentUser, Roles } from '../access.ts';
import { Output } from '../validation.ts';
import { DashboardService } from './dashboard.service.ts';

/** O painel: uma rota só para os quatro perfis, cada um com as chaves do que já lê (door 1). */
@Controller('api/dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  @Roles('admin', 'reception', 'hr_finance', 'instructor')
  @Output(200, dashboardResponseSchema)
  read(@CurrentUser() user: CurrentUser): Promise<DashboardResponse> {
    return this.dashboard.read(user.role);
  }
}
