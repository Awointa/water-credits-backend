import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { OracleService, AggregatedReading } from './oracle.service';
import { OracleSubmission, SubmissionStatus } from './entities/oracle-submission.entity';

// ── Typed mock factory ────────────────────────────────────────────────────────

type QueryRunnerMock = {
  connect: jest.Mock;
  startTransaction: jest.Mock;
  query: jest.Mock;
  manager: { create: jest.Mock; save: jest.Mock };
  commitTransaction: jest.Mock;
  rollbackTransaction: jest.Mock;
  release: jest.Mock;
};

function makeQueryRunner(): QueryRunnerMock {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([{ max_nonce: null }]),
    manager: {
      create: jest.fn().mockImplementation((_Entity: unknown, data: unknown) => data),
      save: jest
        .fn()
        .mockImplementation((_Entity: unknown, entity: unknown) =>
          Promise.resolve({ ...(entity as Record<string, unknown>), id: 'sub-uuid-1' }),
        ),
    },
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

type SubmissionRepoMock = {
  find: jest.Mock;
  findOne: jest.Mock;
  count: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function makeSubmissionRepo(): SubmissionRepoMock {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    })),
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('OracleService', () => {
  let service: OracleService;
  let queryRunner: QueryRunnerMock;
  let submissionRepo: SubmissionRepoMock;
  let oracleQueue: { add: jest.Mock };
  let dataSource: { createQueryRunner: jest.Mock };

  beforeEach(async () => {
    queryRunner = makeQueryRunner();
    submissionRepo = makeSubmissionRepo();
    oracleQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    dataSource = { createQueryRunner: jest.fn().mockReturnValue(queryRunner) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleService,
        { provide: getRepositoryToken(OracleSubmission), useValue: submissionRepo },
        { provide: getQueueToken('oracle-submit'), useValue: oracleQueue },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<OracleService>(OracleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── triggerSubmission — happy path ───────────────────────────────────────

  describe('triggerSubmission — happy path', () => {
    it('creates a submission record and enqueues a job when max_nonce is null (first submission)', async () => {
      queryRunner.query.mockResolvedValue([{ max_nonce: null }]);

      const result = await service.triggerSubmission({
        projectId: 'proj-1',
        oracleAddress: 'GABC',
        readings: { ph: 7.2 },
      });

      expect(result).toBeDefined();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(oracleQueue.add).toHaveBeenCalledWith(
        'oracle-submit-job',
        expect.objectContaining({ projectId: 'proj-1', nonce: 1 }),
        expect.any(Object),
      );
    });

    it('increments nonce correctly when a previous submission exists (max_nonce = 5)', async () => {
      queryRunner.query.mockResolvedValue([{ max_nonce: '5' }]);

      await service.triggerSubmission({
        projectId: 'proj-1',
        oracleAddress: 'GABC',
      });

      expect(oracleQueue.add).toHaveBeenCalledWith(
        'oracle-submit-job',
        expect.objectContaining({ nonce: 6 }),
        expect.any(Object),
      );
    });

    it('includes the submissionId and oracleAddress in the queued job payload', async () => {
      queryRunner.query.mockResolvedValue([{ max_nonce: '0' }]);

      await service.triggerSubmission({
        projectId: 'proj-abc',
        oracleAddress: 'GORACLE',
        readings: {},
      });

      expect(oracleQueue.add).toHaveBeenCalledWith(
        'oracle-submit-job',
        expect.objectContaining({
          submissionId: 'sub-uuid-1',
          projectId: 'proj-abc',
          oracleAddress: 'GORACLE',
          nonce: 1,
        }),
        expect.any(Object),
      );
    });

    it('returns the saved submission object from the transaction', async () => {
      queryRunner.query.mockResolvedValue([{ max_nonce: '2' }]);
      queryRunner.manager.save.mockResolvedValue({
        id: 'sub-uuid-99',
        nonce: 3,
        status: SubmissionStatus.PENDING,
        projectId: 'proj-1',
        oracleAddress: 'GABC',
        readingsSnapshot: {},
      });

      const result = await service.triggerSubmission({
        projectId: 'proj-1',
        oracleAddress: 'GABC',
      });

      expect(result.id).toBe('sub-uuid-99');
      expect(result.nonce).toBe(3);
    });
  });

  // ── triggerSubmission — nonce uniqueness / error handling ────────────────

  describe('triggerSubmission — nonce collision and error handling', () => {
    it('rolls back the transaction and re-throws when a nonce uniqueness violation occurs', async () => {
      const uniqueViolation = new Error(
        'duplicate key value violates unique constraint "UQ_oracle_submissions"',
      );
      queryRunner.manager.save.mockRejectedValue(uniqueViolation);

      await expect(
        service.triggerSubmission({ projectId: 'proj-1', oracleAddress: 'GABC' }),
      ).rejects.toThrow('duplicate key value');

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
      // No job should be enqueued for a failed save.
      expect(oracleQueue.add).not.toHaveBeenCalled();
    });

    it('always releases the query runner even when rollback itself throws', async () => {
      queryRunner.manager.save.mockRejectedValue(new Error('save error'));
      queryRunner.rollbackTransaction.mockRejectedValue(new Error('rollback error'));

      await expect(
        service.triggerSubmission({ projectId: 'p', oracleAddress: 'G' }),
      ).rejects.toThrow();

      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('simulated concurrent race: first call succeeds, second receives a uniqueness error', async () => {
      // Both callers read the same max_nonce so they each compute nonce = 1.
      // The DB unique constraint fires on the second insert.
      queryRunner.query.mockResolvedValue([{ max_nonce: null }]);

      let saveCallCount = 0;
      queryRunner.manager.save.mockImplementation(() => {
        saveCallCount += 1;
        if (saveCallCount === 1) {
          return Promise.resolve({ id: 'sub-1', nonce: 1, status: SubmissionStatus.PENDING });
        }
        return Promise.reject(
          new Error('duplicate key value violates unique constraint "UQ_oracle_submissions"'),
        );
      });

      const [first, second] = await Promise.allSettled([
        service.triggerSubmission({ projectId: 'proj-1', oracleAddress: 'GABC' }),
        service.triggerSubmission({ projectId: 'proj-1', oracleAddress: 'GABC' }),
      ]);

      const successes = [first, second].filter((r) => r.status === 'fulfilled');
      const failures = [first, second].filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect((failures[0] as PromiseRejectedResult).reason.message).toMatch(/duplicate key/);
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns counts from the repository', async () => {
      submissionRepo.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2) // pending
        .mockResolvedValueOnce(7) // confirmed
        .mockResolvedValueOnce(1); // failed
      submissionRepo.findOne.mockResolvedValue(null);

      const status = await service.getStatus();

      expect(status.totalSubmissions).toBe(10);
      expect(status.pending).toBe(2);
      expect(status.confirmed).toBe(7);
      expect(status.failed).toBe(1);
      expect(status.lastSubmission).toBeNull();
    });

    it('includes the most recent submission in the response', async () => {
      const lastSub: Partial<OracleSubmission> = {
        id: 'sub-last',
        status: SubmissionStatus.CONFIRMED,
        nonce: 99,
      };
      submissionRepo.count.mockResolvedValue(5);
      submissionRepo.findOne.mockResolvedValue(lastSub as OracleSubmission);

      const status = await service.getStatus();

      expect(status.lastSubmission).toEqual(lastSub);
    });
  });

  // ── getSubmissions ───────────────────────────────────────────────────────

  describe('getSubmissions', () => {
    function makeQb() {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      submissionRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('returns paginated submissions with no filters applied', async () => {
      const subs = [{ id: 'sub-1' }, { id: 'sub-2' }] as OracleSubmission[];
      const qb = makeQb();
      qb.getManyAndCount.mockResolvedValue([subs, 2]);

      const result = await service.getSubmissions({
        skip: 0,
        limit: 20,
        page: 1,
      } as never);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('applies projectId filter when provided', async () => {
      const qb = makeQb();

      await service.getSubmissions({
        projectId: 'proj-1',
        skip: 0,
        limit: 20,
        page: 1,
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('project_id'),
        expect.objectContaining({ projectId: 'proj-1' }),
      );
    });

    it('applies oracleAddress filter when provided', async () => {
      const qb = makeQb();

      await service.getSubmissions({
        oracleAddress: 'GORACLE',
        skip: 0,
        limit: 20,
        page: 1,
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('oracle_address'),
        expect.objectContaining({ oracleAddress: 'GORACLE' }),
      );
    });

    it('applies status filter when provided', async () => {
      const qb = makeQb();

      await service.getSubmissions({
        status: SubmissionStatus.CONFIRMED,
        skip: 0,
        limit: 20,
        page: 1,
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.objectContaining({ status: SubmissionStatus.CONFIRMED }),
      );
    });

    it('applies startDate and endDate filters when provided', async () => {
      const qb = makeQb();

      await service.getSubmissions({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        skip: 0,
        limit: 20,
        page: 1,
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('created_at >='),
        expect.objectContaining({ startDate: '2026-01-01' }),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('created_at <='),
        expect.objectContaining({ endDate: '2026-12-31' }),
      );
    });
  });

  // ── getPendingSubmissions ─────────────────────────────────────────────────

  describe('getPendingSubmissions', () => {
    it('returns only PENDING submissions ordered by createdAt ASC', async () => {
      const pending = [{ id: 'sub-p1', status: SubmissionStatus.PENDING }] as OracleSubmission[];
      submissionRepo.find.mockResolvedValue(pending);

      const result = await service.getPendingSubmissions();

      expect(result).toEqual(pending);
      expect(submissionRepo.find).toHaveBeenCalledWith({
        where: { status: SubmissionStatus.PENDING },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('aggregateReadings — median calculation', () => {
    function makeSubmission(snap: Record<string, number | undefined>): OracleSubmission {
      return {
        id: Math.random().toString(),
        projectId: 'proj-1',
        oracleAddress: 'GORACLE',
        nonce: 1,
        txHash: '',
        status: SubmissionStatus.CONFIRMED,
        readingsSnapshot: snap as Record<string, unknown>,
        result: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      } as OracleSubmission;
    }

    it('throws NotFoundException when no confirmed submissions exist', async () => {
      submissionRepo.find.mockResolvedValue([]);

      await expect(service.aggregateReadings('proj-empty')).rejects.toThrow(NotFoundException);
    });

    it('returns null for all medians when submissions contain no readings (empty snapshots)', async () => {
      submissionRepo.find.mockResolvedValue([makeSubmission({}), makeSubmission({})]);

      const result: AggregatedReading = await service.aggregateReadings('proj-1');

      expect(result.medianPh).toBeNull();
      expect(result.medianTurbidity).toBeNull();
      expect(result.medianDissolvedOxygen).toBeNull();
      expect(result.medianFlowRate).toBeNull();
      expect(result.medianNitrogen).toBeNull();
      expect(result.medianPhosphorus).toBeNull();
      expect(result.medianTemperature).toBeNull();
    });

    it('calculates the correct median for an odd number of values', async () => {
      // Three ph values: 6, 7, 8 → median = 7
      submissionRepo.find.mockResolvedValue([
        makeSubmission({ ph: 6 }),
        makeSubmission({ ph: 7 }),
        makeSubmission({ ph: 8 }),
      ]);

      const result = await service.aggregateReadings('proj-1');

      expect(result.medianPh).toBe(7);
    });

    it('calculates the correct median for an even number of values (average of two middle elements)', async () => {
      // Four ph values: 6, 7, 8, 9 → sorted [6,7,8,9] → median = (7+8)/2 = 7.5
      submissionRepo.find.mockResolvedValue([
        makeSubmission({ ph: 9 }),
        makeSubmission({ ph: 6 }),
        makeSubmission({ ph: 7 }),
        makeSubmission({ ph: 8 }),
      ]);

      const result = await service.aggregateReadings('proj-1');

      expect(result.medianPh).toBe(7.5);
    });

    it('handles a single submission (single-value median equals that value)', async () => {
      submissionRepo.find.mockResolvedValue([makeSubmission({ ph: 7.2 })]);

      const result = await service.aggregateReadings('proj-1');

      expect(result.medianPh).toBe(7.2);
    });

    it('handles sparse readings: parameters missing from some snapshots are excluded from the median', async () => {
      // Only two of three submissions have a turbidity reading.
      // Median of [10, 20] = 15.
      submissionRepo.find.mockResolvedValue([
        makeSubmission({ turbidity: 10 }),
        makeSubmission({ turbidity: 20 }),
        makeSubmission({ ph: 7.0 }), // no turbidity
      ]);

      const result = await service.aggregateReadings('proj-1');

      expect(result.medianTurbidity).toBe(15);
      // ph only present in one submission
      expect(result.medianPh).toBe(7.0);
    });

    it('calculates correct medians for all parameters when all are fully populated', async () => {
      // Exercise every parameter push branch (dissolvedOxygen, flowRate, nitrogen,
      // phosphorus, temperature) so each conditional in aggregateReadings is hit.
      submissionRepo.find.mockResolvedValue([
        makeSubmission({
          ph: 7.0,
          turbidity: 10,
          dissolvedOxygen: 8.0,
          flowRate: 1.5,
          nitrogen: 2.0,
          phosphorus: 0.1,
          temperature: 18.0,
        }),
        makeSubmission({
          ph: 7.4,
          turbidity: 12,
          dissolvedOxygen: 9.0,
          flowRate: 2.0,
          nitrogen: 3.0,
          phosphorus: 0.2,
          temperature: 20.0,
        }),
        makeSubmission({
          ph: 7.2,
          turbidity: 11,
          dissolvedOxygen: 8.5,
          flowRate: 1.8,
          nitrogen: 2.5,
          phosphorus: 0.15,
          temperature: 19.0,
        }),
      ]);

      const result = await service.aggregateReadings('proj-1');

      // Median of [7.0, 7.2, 7.4] = 7.2
      expect(result.medianPh).toBe(7.2);
      // Median of [10, 11, 12] = 11
      expect(result.medianTurbidity).toBe(11);
      // Median of [8.0, 8.5, 9.0] = 8.5
      expect(result.medianDissolvedOxygen).toBe(8.5);
      // Median of [1.5, 1.8, 2.0] = 1.8
      expect(result.medianFlowRate).toBe(1.8);
      // Median of [2.0, 2.5, 3.0] = 2.5
      expect(result.medianNitrogen).toBe(2.5);
      // Median of [0.1, 0.15, 0.2] = 0.15
      expect(result.medianPhosphorus).toBeCloseTo(0.15);
      // Median of [18.0, 19.0, 20.0] = 19.0
      expect(result.medianTemperature).toBe(19.0);
    });

    it('reports the number of submissions as oracleCount', async () => {
      submissionRepo.find.mockResolvedValue([
        makeSubmission({ ph: 7 }),
        makeSubmission({ ph: 7 }),
        makeSubmission({ ph: 7 }),
      ]);

      const result = await service.aggregateReadings('proj-1');

      expect(result.oracleCount).toBe(3);
    });

    it('sets startTime and endTime from the first and last confirmed submission', async () => {
      const t1 = new Date('2026-01-01T00:00:00Z');
      const t2 = new Date('2026-01-02T00:00:00Z');

      const sub1 = makeSubmission({ ph: 7 });
      sub1.createdAt = t1;
      const sub2 = makeSubmission({ ph: 7 });
      sub2.createdAt = t2;

      submissionRepo.find.mockResolvedValue([sub1, sub2]);

      const result = await service.aggregateReadings('proj-1');

      expect(result.startTime).toEqual(t1);
      expect(result.endTime).toEqual(t2);
    });
  });
});
