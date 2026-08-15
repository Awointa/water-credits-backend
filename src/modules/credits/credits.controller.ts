import { Controller, Get, Post, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { RetireCreditsDto } from './dto/retire-credits.dto';
import { CreditQueryDto } from './dto/credit-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Retirement } from './entities/retirement.entity';
import { PaginatedResponseDto } from '../../common/dto/api-response.dto';

@Controller('credits')
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get()
  async getCreditOverview() {
    return this.creditsService.getCreditOverview();
  }

  @Get('projects/:projectId')
  async getProjectCredits(@Param('projectId') projectId: string) {
    return this.creditsService.getProjectCredits(projectId);
  }

  @Get('portfolio')
  async getPortfolio(@CurrentUser('id') userId: string) {
    return this.creditsService.getPortfolio(userId);
  }

  @Post('retire')
  @HttpCode(HttpStatus.CREATED)
  async retire(
    @CurrentUser('id') userId: string,
    @Body() dto: RetireCreditsDto,
  ): Promise<Retirement> {
    return this.creditsService.retire(userId, dto);
  }

  @Get('retirements')
  async getRetirements(
    @CurrentUser('id') userId: string,
    @Query() query: CreditQueryDto,
  ): Promise<PaginatedResponseDto<Retirement>> {
    const { data, total, page, limit } = await this.creditsService.getRetirements(userId, query);
    return PaginatedResponseDto.from(data, total, page, limit);
  }

  @Get('retirements/:id/certificate')
  async getCertificate(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<Retirement> {
    return this.creditsService.getCertificate(id, userId);
  }

  @Get('total-retired')
  @Public()
  async getTotalRetired(): Promise<{ total: number }> {
    const total = await this.creditsService.getTotalRetired();
    return { total };
  }
}
