import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Public()
  @Get('overview')
  @ApiOperation({ summary: 'Get platform overview metrics' })
  async getOverview() {
    return this.analyticsService.getOverview();
  }

  @Public()
  @Get('credits-over-time')
  @ApiOperation({ summary: 'Get monthly credit mint/retire volumes' })
  async getCreditsOverTime() {
    return this.analyticsService.getCreditsOverTime();
  }

  @Public()
  @Get('project-distribution')
  @ApiOperation({ summary: 'Get project distribution by methodology, status, geography' })
  async getProjectDistribution() {
    return this.analyticsService.getProjectDistribution();
  }

  @Public()
  @Get('retirement-by-purpose')
  @ApiOperation({ summary: 'Get retirement breakdown by purpose' })
  async getRetirementByPurpose() {
    return this.analyticsService.getRetirementByPurpose();
  }

  @Public()
  @Get('top-projects')
  @ApiOperation({ summary: 'Get the highest credit-generating projects' })
  async getTopProjects(@Query('limit') limit?: number) {
    return this.analyticsService.getTopProjects(limit);
  }

  @Public()
  @Get('top-retirees')
  @ApiOperation({ summary: 'Get the most active credit buyers' })
  async getTopRetirees(@Query('limit') limit?: number) {
    return this.analyticsService.getTopRetirees(limit);
  }
}
