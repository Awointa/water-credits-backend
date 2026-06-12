import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Proposal, ProposalStatus } from './entities/proposal.entity';
import { GovernanceConfig } from './entities/governance-config.entity';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { VoteDto } from './dto/vote.dto';
import { GovernanceQueryDto } from './dto/governance-query.dto';

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);

  constructor(
    @InjectRepository(Proposal)
    private readonly proposalRepo: Repository<Proposal>,
    @InjectRepository(GovernanceConfig)
    private readonly configRepo: Repository<GovernanceConfig>,
    private readonly configService: ConfigService,
  ) {}

  async getConfig(): Promise<GovernanceConfig> {
    let config = await this.configRepo.findOne({ where: {} as any });
    if (!config) {
      config = this.configRepo.create({
        protocolFeeBps: 100,
        minOracleConfirmations: 3,
        votingPeriod: 604800,
        timelockPeriod: 86400,
        quorum: 3,
      });
      config = await this.configRepo.save(config);
    }
    return config;
  }

  async updateConfig(updates: Partial<GovernanceConfig>): Promise<GovernanceConfig> {
    const config = await this.getConfig();
    Object.assign(config, updates);
    return this.configRepo.save(config);
  }

  async getProposals(query: GovernanceQueryDto): Promise<{
    data: Proposal[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qb = this.proposalRepo.createQueryBuilder('proposal');

    if (query.status) {
      qb.andWhere('proposal.status = :status', { status: query.status });
    }
    if (query.proposer) {
      qb.andWhere('proposal.proposer = :proposer', { proposer: query.proposer });
    }
    if (query.actionType) {
      qb.andWhere('proposal.action_type = :actionType', { actionType: query.actionType });
    }

    qb.orderBy('proposal.created_at', 'DESC');
    qb.skip(query.skip).take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page ?? 1, limit: query.limit ?? 20 };
  }

  async getProposalById(id: string): Promise<Proposal> {
    const proposal = await this.proposalRepo.findOne({ where: { id } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    await this.checkExpiry(proposal);
    return proposal;
  }

  async createProposal(proposer: string, dto: CreateProposalDto): Promise<Proposal> {
    const config = await this.getConfig();

    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + config.votingPeriod);

    const proposal = this.proposalRepo.create({
      proposer,
      title: dto.title,
      description: dto.description ?? null,
      actionType: dto.actionType,
      actionParams: (dto.actionParams as Record<string, unknown>) ?? null,
      votesFor: 0,
      votesAgainst: 0,
      status: ProposalStatus.ACTIVE,
      deadline,
    });

    const saved = await this.proposalRepo.save(proposal);
    this.logger.log(`Proposal ${saved.id} created by ${proposer}`);
    return saved;
  }

  async vote(proposalId: string, voter: string, dto: VoteDto): Promise<Proposal> {
    const proposal = await this.getProposalById(proposalId);

    if (proposal.status !== ProposalStatus.ACTIVE) {
      throw new BadRequestException('Proposal is not active');
    }

    if (dto.approve) {
      proposal.votesFor += 1;
    } else {
      proposal.votesAgainst += 1;
    }

    const config = await this.getConfig();
    const totalVotes = proposal.votesFor + proposal.votesAgainst;

    if (totalVotes >= config.quorum) {
      proposal.status = proposal.votesFor > proposal.votesAgainst
        ? ProposalStatus.PASSED
        : ProposalStatus.REJECTED;
    }

    const saved = await this.proposalRepo.save(proposal);
    this.logger.log(
      `Vote cast on proposal ${proposalId} by ${voter}: ${dto.approve ? 'for' : 'against'}`,
    );
    return saved;
  }

  async executeProposal(proposalId: string, executor: string): Promise<Proposal> {
    const proposal = await this.getProposalById(proposalId);

    if (proposal.status !== ProposalStatus.PASSED) {
      throw new BadRequestException('Proposal has not passed');
    }

    const config = await this.getConfig();
    const elapsed = Date.now() - new Date(proposal.deadline).getTime();
    const timelockMs = config.timelockPeriod * 1000;

    if (elapsed < timelockMs) {
      throw new ForbiddenException(
        `Timelock not elapsed. Wait ${Math.ceil((timelockMs - elapsed) / 1000)} more seconds`,
      );
    }

    proposal.status = ProposalStatus.EXECUTED;
    const saved = await this.proposalRepo.save(proposal);
    this.logger.log(`Proposal ${proposalId} executed by ${executor}`);
    return saved;
  }

  private async checkExpiry(proposal: Proposal): Promise<void> {
    if (proposal.status !== ProposalStatus.ACTIVE) return;
    if (new Date() > new Date(proposal.deadline)) {
      proposal.status = ProposalStatus.EXPIRED;
      await this.proposalRepo.save(proposal);
    }
  }
}
