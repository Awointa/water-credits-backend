import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { GovernanceService } from './governance.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { VoteDto } from './dto/vote.dto';
import { GovernanceQueryDto } from './dto/governance-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';
import { Proposal } from './entities/proposal.entity';
import { GovernanceConfig } from './entities/governance-config.entity';
import { PaginatedResponseDto } from '../../common/dto/api-response.dto';

@Controller('governance')
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('config')
  @Public()
  async getConfig(): Promise<GovernanceConfig> {
    return this.governanceService.getConfig();
  }

  @Patch('config')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateConfig(@Body() updates: Partial<GovernanceConfig>): Promise<GovernanceConfig> {
    return this.governanceService.updateConfig(updates);
  }

  @Get('proposals')
  @Public()
  async getProposals(
    @Query() query: GovernanceQueryDto,
  ): Promise<PaginatedResponseDto<Proposal>> {
    const { data, total, page, limit } = await this.governanceService.getProposals(query);
    return PaginatedResponseDto.from(data, total, page, limit);
  }

  @Get('proposals/:id')
  @Public()
  async getProposalById(@Param('id') id: string): Promise<Proposal> {
    return this.governanceService.getProposalById(id);
  }

  @Post('proposals')
  @Roles(UserRole.ADMIN, UserRole.VERIFIER)
  @HttpCode(HttpStatus.CREATED)
  async createProposal(
    @CurrentUser('wallet') proposer: string,
    @Body() dto: CreateProposalDto,
  ): Promise<Proposal> {
    return this.governanceService.createProposal(proposer, dto);
  }

  @Post('proposals/:id/vote')
  @Roles(UserRole.ADMIN, UserRole.VERIFIER)
  @HttpCode(HttpStatus.OK)
  async vote(
    @Param('id') id: string,
    @CurrentUser('wallet') voter: string,
    @Body() dto: VoteDto,
  ): Promise<Proposal> {
    return this.governanceService.vote(id, voter, dto);
  }

  @Post('proposals/:id/execute')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async executeProposal(
    @Param('id') id: string,
    @CurrentUser('wallet') executor: string,
  ): Promise<Proposal> {
    return this.governanceService.executeProposal(id, executor);
  }
}
