import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository, Between, DataSource, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OracleSubmission, SubmissionStatus } from './entities/oracle-submission.entity';
import { OracleQueryDto } from './dto/oracle-query.dto';
import { TriggerSubmissionDto } from './dto/trigger-submission.dto';
import { StellarService } from '../stellar/stellar.service';

export interface AggregatedReading {
  medianPh: number | null;
  medianTurbidity: number | null;
  medianDissolvedOxygen: number | null;
  medianFlowRate: number | null;
  medianNitrogen: number | null;
  medianPhosphorus: number | null;
  medianTemperature: number | null;
  oracleCount: number;
  startTime: Date;
  endTime: Date;
}

@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);

  constructor(
    @InjectRepository(OracleSubmission)
    private readonly submissionRepo: Repository<OracleSubmission>,
    @InjectQueue('oracle-submit')
    private readonly oracleQueue: Queue,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly stellarService: StellarService,
  ) {}

  async getStatus(): Promise<{
    totalSubmissions: number;
    pending: number;
    confirmed: number;
    failed: number;
    lastSubmission: OracleSubmission | null;
  }> {
    const [totalSubmissions, pending, confirmed, failed, lastSubmission] = await Promise.all([
      this.submissionRepo.count(),
      this.submissionRepo.count({ where: { status: SubmissionStatus.PENDING } }),
      this.submissionRepo.count({ where: { status: SubmissionStatus.CONFIRMED } }),
      this.submissionRepo.count({ where: { status: SubmissionStatus.FAILED } }),
      this.submissionRepo.findOne({ order: { createdAt: 'DESC' } }),
    ]);

    return { totalSubmissions, pending, confirmed, failed, lastSubmission };
  }

  async getSubmissions(
    query: OracleQueryDto,
  ): Promise<{ data: OracleSubmission[]; total: number; page: number; limit: number }> {
    const qb = this.submissionRepo.createQueryBuilder('submission');

    if (query.projectId) {
      qb.andWhere('submission.project_id = :projectId', { projectId: query.projectId });
    }
    if (query.oracleAddress) {
      qb.andWhere('submission.oracle_address = :oracleAddress', {
        oracleAddress: query.oracleAddress,
      });
    }
    if (query.status) {
      qb.andWhere('submission.status = :status', { status: query.status });
    }
    if (query.startDate) {
      qb.andWhere('submission.created_at >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('submission.created_at <= :endDate', { endDate: query.endDate });
    }

    qb.orderBy('submission.created_at', 'DESC');
    qb.skip(query.skip).take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page ?? 1, limit: query.limit ?? 20 };
  }

  async getPendingSubmissions(): Promise<OracleSubmission[]> {
    return this.submissionRepo.find({
      where: { status: SubmissionStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async triggerSubmission(dto: TriggerSubmissionDto): Promise<OracleSubmission> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let saved: OracleSubmission;
    try {
      // PostgreSQL advisory lock keyed on a hash of the oracle address.
      // This serialises concurrent callers even when no rows exist yet for
      // that oracle (which the FOR UPDATE on MAX(nonce) below cannot lock).
      await queryRunner.query(
        `SELECT pg_advisory_xact_lock(hashtext('oracle_nonce'), hashtext($1))`,
        [dto.oracleAddress],
      );

      const [row]: [{ max_nonce: string | null }] = await queryRunner.query(
        `SELECT MAX(nonce) AS max_nonce
           FROM oracle_submissions
          WHERE oracle_address = $1
          FOR UPDATE`,
        [dto.oracleAddress],
      );
      const nonce = (row.max_nonce !== null ? parseInt(row.max_nonce, 10) : 0) + 1;

      const submission = queryRunner.manager.create(OracleSubmission, {
        projectId: dto.projectId,
        oracleAddress: dto.oracleAddress,
        nonce,
        txHash: '',
        status: SubmissionStatus.PENDING,
        readingsSnapshot: dto.readings ?? {},
      });

      saved = await queryRunner.manager.save(OracleSubmission, submission);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.oracleQueue.add(
      'oracle-submit-job',
      {
        submissionId: saved.id,
        projectId: dto.projectId,
        oracleAddress: dto.oracleAddress,
        nonce: saved.nonce,
      },
      {
        attempts: 3,
        backoff: { type: 'fixed', delay: 10000 },
        removeOnComplete: 50,
      },
    );

    this.logger.log(`Queued oracle submission ${saved.id} for project ${dto.projectId}`);
    return saved;
  }

  async aggregateReadings(
    projectId: string,
    startTime?: Date,
    endTime?: Date,
  ): Promise<AggregatedReading> {
    const submissions = await this.submissionRepo.find({
      where: {
        projectId,
        status: SubmissionStatus.CONFIRMED,
        ...(startTime && endTime ? { createdAt: Between(startTime, endTime) } : {}),
      },
    });

    if (submissions.length === 0) {
      throw new NotFoundException('No confirmed submissions found for aggregation');
    }

    const phValues: number[] = [];
    const turbidityValues: number[] = [];
    const doValues: number[] = [];
    const flowValues: number[] = [];
    const nValues: number[] = [];
    const pValues: number[] = [];
    const tempValues: number[] = [];

    for (const sub of submissions) {
      const snap = sub.readingsSnapshot as Record<string, number | undefined>;
      if (snap.ph !== undefined) {
        phValues.push(snap.ph);
      }
      if (snap.turbidity !== undefined) {
        turbidityValues.push(snap.turbidity);
      }
      if (snap.dissolvedOxygen !== undefined) {
        doValues.push(snap.dissolvedOxygen);
      }
      if (snap.flowRate !== undefined) {
        flowValues.push(snap.flowRate);
      }
      if (snap.nitrogen !== undefined) {
        nValues.push(snap.nitrogen);
      }
      if (snap.phosphorus !== undefined) {
        pValues.push(snap.phosphorus);
      }
      if (snap.temperature !== undefined) {
        tempValues.push(snap.temperature);
      }
    }

    return {
      medianPh: this.median(phValues),
      medianTurbidity: this.median(turbidityValues),
      medianDissolvedOxygen: this.median(doValues),
      medianFlowRate: this.median(flowValues),
      medianNitrogen: this.median(nValues),
      medianPhosphorus: this.median(pValues),
      medianTemperature: this.median(tempValues),
      oracleCount: submissions.length,
      startTime: submissions[0]?.createdAt ?? new Date(),
      endTime: submissions[submissions.length - 1]?.createdAt ?? new Date(),
    };
  }

  // ── Nonce-gap detection ─────────────────────────────────────────────────

  /**
   * Logs a warning when the local max confirmed nonce diverges from the
   * on-chain oracle nonce by more than 1 (indicating a missed or desynced
   * submission).
   */
  async detectNonceDrift(oracleContractId: string, oracleAddress: string): Promise<void> {
    const localMax = await this.submissionRepo.findOne({
      where: { oracleAddress, status: SubmissionStatus.CONFIRMED },
      order: { nonce: 'DESC' },
    });
    const localNonce = localMax?.nonce ?? 0;

    let onChainNonce: number;
    try {
      onChainNonce = await this.stellarService.getOracleNonce(oracleContractId, oracleAddress);
    } catch {
      this.logger.warn(`detectNonceDrift: could not read on-chain nonce for ${oracleAddress}`);
      return;
    }

    const diff = onChainNonce - localNonce;
    if (Math.abs(diff) > 1) {
      this.logger.warn(
        `Nonce drift detected for oracle ${oracleAddress}: ` +
          `local=${localNonce} on-chain=${onChainNonce} diff=${diff}`,
      );
    }
  }

  /**
   * Finds confirmed submissions whose nonce is greater than the given
   * on-chain nonce (stale / likely invalid on chain).
   */
  async findStaleSubmissions(
    oracleContractId: string,
    oracleAddress: string,
  ): Promise<OracleSubmission[]> {
    let onChainNonce: number;
    try {
      onChainNonce = await this.stellarService.getOracleNonce(oracleContractId, oracleAddress);
    } catch {
      return [];
    }

    return this.submissionRepo.find({
      where: {
        oracleAddress,
        status: SubmissionStatus.CONFIRMED,
        nonce: MoreThan(onChainNonce),
      },
      order: { nonce: 'ASC' },
    });
  }

  private median(values: number[]): number | null {
    if (values.length === 0) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}
