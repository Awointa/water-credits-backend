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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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

@ApiTags('governance')
@ApiBearerAuth()
@Controller('governance')
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('config')
  @Public()
  @ApiOperation({ summary: 'Get current protocol parameters' })
  async getConfig(): Promise<GovernanceConfig> {
    return this.governanceService.getConfig();
  }

  @Patch('config')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update protocol parameters (admin)' })
  async updateConfig(@Body() updates: Partial<GovernanceConfig>): Promise<GovernanceConfig> {
    return this.governanceService.updateConfig(updates);
  }

  @Get('proposals')
  @Public()
  @ApiOperation({ summary: 'List governance proposals (paginated)' })
  async getProposals(@Query() query: GovernanceQueryDto): Promise<PaginatedResponseDto<Proposal>> {
    const { data, total, page, limit } = await this.governanceService.getProposals(query);
    return PaginatedResponseDto.from(data, total, page, limit);
  }

  @Get('proposals/:id')
  @Public()
  @ApiOperation({ summary: 'Get a proposal by ID' })
  async getProposalById(@Param('id') id: string): Promise<Proposal> {
    return this.governanceService.getProposalById(id);
  }

  @Post('proposals')
  @Roles(UserRole.ADMIN, UserRole.VERIFIER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new governance proposal' })
  async createProposal(
    @CurrentUser('wallet') proposer: string,
    @Body() dto: CreateProposalDto,
  ): Promise<Proposal> {
    return this.governanceService.createProposal(proposer, dto);
  }

  @Post('proposals/:id/vote')
  @Roles(UserRole.ADMIN, UserRole.VERIFIER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cast a vote on a proposal' })
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
  @ApiOperation({ summary: 'Execute an approved proposal (admin)' })
  async executeProposal(
    @Param('id') id: string,
    @CurrentUser('wallet') executor: string,
  ): Promise<Proposal> {
    return this.governanceService.executeProposal(id, executor);
  }
}
