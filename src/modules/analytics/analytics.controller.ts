import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Public()
  @Get('overview')
  async getOverview() {
    return this.analyticsService.getOverview();
  }

  @Public()
  @Get('credits-over-time')
  async getCreditsOverTime() {
    return this.analyticsService.getCreditsOverTime();
  }

  @Public()
  @Get('project-distribution')
  async getProjectDistribution() {
    return this.analyticsService.getProjectDistribution();
  }

  @Public()
  @Get('retirement-by-purpose')
  async getRetirementByPurpose() {
    return this.analyticsService.getRetirementByPurpose();
  }

  @Public()
  @Get('top-projects')
  async getTopProjects(@Query('limit') limit?: number) {
    return this.analyticsService.getTopProjects(limit);
  }

  @Public()
  @Get('top-retirees')
  async getTopRetirees(@Query('limit') limit?: number) {
    return this.analyticsService.getTopRetirees(limit);
  }
}
