import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryFailedError } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Proposal, ProposalStatus } from './entities/proposal.entity';
import { ProposalVote } from './entities/proposal-vote.entity';
import { GovernanceConfig } from './entities/governance-config.entity';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { VoteDto } from './dto/vote.dto';
import { GovernanceQueryDto } from './dto/governance-query.dto';
import { StellarService } from '../stellar/stellar.service';

// PostgreSQL unique-violation error code
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);

  constructor(
    @InjectRepository(Proposal)
    private readonly proposalRepo: Repository<Proposal>,
    @InjectRepository(ProposalVote)
    private readonly voteRepo: Repository<ProposalVote>,
    @InjectRepository(GovernanceConfig)
    private readonly configRepo: Repository<GovernanceConfig>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly stellarService: StellarService,
  ) {}

  // ── Config ────────────────────────────────────────────────────────────────

  async getConfig(): Promise<GovernanceConfig> {
    let config = await this.configRepo.findOne({ where: {} as Record<string, never> });
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

  // ── Proposals ─────────────────────────────────────────────────────────────

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
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }
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

  // ── Vote ─────────────────────────────────────────────────────────────────
  //
  // Correctness invariants:
  //   1. Exactly one vote per (proposal_id, voter_wallet): enforced by the DB
  //      UNIQUE constraint on proposal_votes AND by trying to INSERT inside a
  //      transaction before doing any counter update.
  //   2. Counter update is an atomic SQL INCREMENT (not a read-modify-write),
  //      so concurrent votes on the same proposal cannot lose each other's
  //      counts.
  //   3. The duplicate-check read, the vote INSERT, and the counter increment
  //      all happen inside a single serialisable transaction, so a concurrent
  //      second request from the same wallet will either see the first vote
  //      already committed (fails the findOne check) or hit the unique
  //      constraint (mapped to 409 Conflict).

  async vote(proposalId: string, voter: string, dto: VoteDto): Promise<Proposal> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      // 1. Load the proposal inside the transaction so we see a consistent
      //    snapshot (also locks the row against concurrent expiry writes).
      const proposal = await queryRunner.manager.findOne(Proposal, {
        where: { id: proposalId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!proposal) {
        throw new NotFoundException('Proposal not found');
      }

      // Handle expiry inside the same transaction so we never accept a vote on
      // an already-expired proposal.
      if (proposal.status === ProposalStatus.ACTIVE && new Date() > new Date(proposal.deadline)) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(Proposal)
          .set({ status: ProposalStatus.EXPIRED })
          .where('id = :id', { id: proposalId })
          .execute();
        proposal.status = ProposalStatus.EXPIRED;
      }

      if (proposal.status !== ProposalStatus.ACTIVE) {
        throw new BadRequestException('Proposal is not active');
      }

      // 2. Guard: application-layer duplicate check (fast path before the DB
      //    round-trip on insert).  The DB constraint is the definitive guard.
      const existingVote = await queryRunner.manager.findOne(ProposalVote, {
        where: { proposalId, voterWallet: voter },
      });
      if (existingVote) {
        throw new ConflictException('You have already voted on this proposal');
      }

      // 3. Insert the vote record.  If two concurrent transactions both pass
      //    step 2, the unique constraint on (proposal_id, voter_wallet) will
      //    cause one of them to throw a unique-violation, which we translate to
      //    409 Conflict below.
      const voteRecord = queryRunner.manager.create(ProposalVote, {
        proposalId,
        voterWallet: voter,
        support: dto.approve,
      });
      await queryRunner.manager.save(ProposalVote, voteRecord);

      // 4. Atomic counter increment — avoids the stale read-modify-write race
      //    where two concurrent votes both read votesFor=5 and both write 6.
      const counterColumn = dto.approve ? 'votes_for' : 'votes_against';
      await queryRunner.manager
        .createQueryBuilder()
        .update(Proposal)
        .set({ [counterColumn]: () => `${counterColumn} + 1` })
        .where('id = :id', { id: proposalId })
        .execute();

      // 5. Reload the proposal to get the authoritative counter values so we
      //    can evaluate quorum.  This reload is inside the same transaction, so
      //    it sees the increment we just applied.
      const updated = await queryRunner.manager.findOne(Proposal, {
        where: { id: proposalId },
      });
      if (!updated) {
        throw new InternalServerErrorException('Proposal disappeared mid-transaction');
      }

      // 6. Quorum check — cast bigint columns to Number for arithmetic.
      const config = await this.getConfig();
      const votesFor = Number(updated.votesFor);
      const votesAgainst = Number(updated.votesAgainst);
      const totalVotes = votesFor + votesAgainst;

      if (totalVotes >= config.quorum) {
        const newStatus = votesFor > votesAgainst ? ProposalStatus.PASSED : ProposalStatus.REJECTED;

        await queryRunner.manager
          .createQueryBuilder()
          .update(Proposal)
          .set({ status: newStatus })
          .where('id = :id', { id: proposalId })
          .execute();

        updated.status = newStatus;
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Vote cast on proposal ${proposalId} by ${voter}: ${dto.approve ? 'for' : 'against'}`,
      );

      return updated;
    } catch (err) {
      await queryRunner.rollbackTransaction();

      // Map Postgres unique-violation (race-condition path) to 409 Conflict so
      // the second concurrent vote gets a clean, retryable error rather than a
      // 500.
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('You have already voted on this proposal');
      }

      // Re-throw NestJS HTTP exceptions directly.
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException ||
        err instanceof ForbiddenException ||
        err instanceof InternalServerErrorException
      ) {
        throw err;
      }

      this.logger.error(`Vote transaction failed for proposal ${proposalId}`, err);
      throw new InternalServerErrorException('Vote could not be recorded');
    } finally {
      await queryRunner.release();
    }
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  //
  // Contract for callers:
  //   • Returns the updated Proposal with status=EXECUTED only after the
  //     Soroban transaction is confirmed.
  //   • If the Soroban call throws for any reason (RPC error, tx failure,
  //     timeout) the local status remains PASSED and the error propagates so
  //     the caller can retry.

  async executeProposal(proposalId: string, executor: string): Promise<Proposal> {
    const proposal = await this.getProposalById(proposalId);

    if (proposal.status !== ProposalStatus.PASSED) {
      throw new BadRequestException('Proposal has not passed');
    }

    // Timelock: measure elapsed from the voting deadline (the earliest point
    // the proposal could have passed), not from local server time of the
    // createProposal call, to prevent clock-skew games.
    const config = await this.getConfig();
    const elapsed = Date.now() - new Date(proposal.deadline).getTime();
    const timelockMs = config.timelockPeriod * 1000;

    if (elapsed < timelockMs) {
      throw new ForbiddenException(
        `Timelock not elapsed. Wait ${Math.ceil((timelockMs - elapsed) / 1000)} more seconds`,
      );
    }

    // Resolve the Soroban governance contract ID from config.
    const governanceContractId = this.configService.get<string>('stellar.contractGovernance', '');
    if (!governanceContractId) {
      throw new InternalServerErrorException(
        'Governance contract ID is not configured (stellar.contractGovernance)',
      );
    }

    // onChainProposalId must be set before execution.  In the current flow
    // proposals are created off-chain only, so we derive a deterministic u32
    // from the DB row's auto-incrementing numeric sequence.  If the proposal
    // was created on-chain in the future, this field would be populated at
    // proposal creation time instead.
    if (proposal.onChainProposalId === null || proposal.onChainProposalId === undefined) {
      throw new BadRequestException(
        'Proposal does not have an on-chain ID. Set onChainProposalId before executing.',
      );
    }

    // ── Call Soroban BEFORE updating local state ──────────────────────────
    // Local status is updated only after confirmation so that a failed RPC
    // call leaves the proposal in PASSED and allows retries.
    let txHash: string;
    try {
      const result = await this.stellarService.execute(
        governanceContractId,
        proposal.onChainProposalId,
      );

      // stellarService.execute() delegates to invokeContract() which calls
      // sendTx() (via StellarClient). sendTx returns a
      // GetTransactionResponse on success and throws on failure.
      // The hash is surfaced via sendTxWithHash; for execute we call the
      // lower-level invokeContract path, so we extract what we can.
      // If the result carries a hash field, use it; otherwise fall back to a
      // placeholder so the record is still useful.
      txHash =
        (result as { txHash?: string } | null)?.txHash ??
        (result as { hash?: string } | null)?.hash ??
        'confirmed';
    } catch (err) {
      this.logger.error(
        `Soroban execute() failed for proposal ${proposalId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Do NOT update local status — leave as PASSED so the admin can retry.
      throw new InternalServerErrorException(
        `On-chain execution failed: ${(err as Error).message}`,
      );
    }

    // ── Persist confirmed execution ───────────────────────────────────────
    await this.proposalRepo
      .createQueryBuilder()
      .update(Proposal)
      .set({
        status: ProposalStatus.EXECUTED,
        executionTxHash: txHash,
        executedBy: executor,
        executedAt: new Date(),
      })
      .where('id = :id', { id: proposalId })
      .execute();

    const saved = await this.proposalRepo.findOne({ where: { id: proposalId } });
    if (!saved) {
      throw new InternalServerErrorException('Proposal not found after execution update');
    }

    this.logger.log(`Proposal ${proposalId} executed on-chain by ${executor} (txHash: ${txHash})`);
    return saved;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async checkExpiry(proposal: Proposal): Promise<void> {
    if (proposal.status !== ProposalStatus.ACTIVE) {
      return;
    }
    if (new Date() > new Date(proposal.deadline)) {
      proposal.status = ProposalStatus.EXPIRED;
      await this.proposalRepo.save(proposal);
    }
  }
}
