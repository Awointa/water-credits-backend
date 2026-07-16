import { Test, TestingModule } from '@nestjs/testing';
import { OracleService } from './oracle.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OracleSubmission, SubmissionStatus } from './entities/oracle-submission.entity';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

// ---------------------------------------------------------------------------
// Nonce collision test — two concurrent triggerSubmission calls must not both
// succeed with the same nonce.
//
// The real fix serialises concurrent callers via a SELECT ... FOR UPDATE inside
// a transaction.  In unit tests we simulate the race by making the mock
// queryRunner reflect the same "last nonce = 0" for both callers simultaneously
// and asserting that the second insert (which would violate the unique
// constraint) causes that caller to throw a meaningful error rather than
// silently returning a duplicate nonce.
// ---------------------------------------------------------------------------

describe('OracleService', () => {
  let service: OracleService;

  // Mutable so individual tests can override it.
  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    query: jest.Mock;
    manager: { create: jest.Mock; save: jest.Mock };
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
  };

  let mockSubmissionRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  let mockQueue: { add: jest.Mock };
  let mockDataSource: { createQueryRunner: jest.Mock };

  beforeEach(async () => {
    mockQueryRunner = {
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

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    mockSubmissionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
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
        getMany: jest.fn(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(),
      })),
    };

    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleService,
        {
          provide: getRepositoryToken(OracleSubmission),
          useValue: mockSubmissionRepo,
        },
        {
          provide: getQueueToken('oracle-submit'),
          useValue: mockQueue,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<OracleService>(OracleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Happy path: single triggerSubmission ──────────────────────────────────

  it('creates a submission and enqueues a job', async () => {
    // max_nonce = null → nonce will be 1
    mockQueryRunner.query.mockResolvedValue([{ max_nonce: null }]);

    const result = await service.triggerSubmission({
      projectId: 'proj-1',
      oracleAddress: 'GABC',
      readings: { ph: 7.2 },
    });

    expect(result).toBeDefined();
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalledWith(
      'oracle-submit-job',
      expect.objectContaining({ projectId: 'proj-1', nonce: 1 }),
      expect.any(Object),
    );
  });

  it('uses max_nonce + 1 as the next nonce', async () => {
    mockQueryRunner.query.mockResolvedValue([{ max_nonce: '5' }]);

    await service.triggerSubmission({
      projectId: 'proj-1',
      oracleAddress: 'GABC',
    });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'oracle-submit-job',
      expect.objectContaining({ nonce: 6 }),
      expect.any(Object),
    );
  });

  // ── Nonce collision / race condition ─────────────────────────────────────
  //
  // When the database unique constraint on (oracle_address, nonce) fires, the
  // save inside the transaction will throw.  The service must:
  //   1. Roll back the transaction.
  //   2. Release the query runner.
  //   3. Re-throw the error (no silent swallow).
  //
  // In production this is prevented by the FOR UPDATE lock; this test verifies
  // the error-handling path that acts as the last line of defence.

  it('rolls back and re-throws when a nonce uniqueness violation occurs', async () => {
    const uniqueViolation = new Error(
      'duplicate key value violates unique constraint "UQ_oracle_submissions"',
    );

    mockQueryRunner.manager.save.mockRejectedValue(uniqueViolation);

    await expect(
      service.triggerSubmission({
        projectId: 'proj-1',
        oracleAddress: 'GABC',
      }),
    ).rejects.toThrow('duplicate key value');

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
    // The job must NOT have been enqueued for a failed save.
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('always releases the query runner even when rollback itself throws', async () => {
    mockQueryRunner.manager.save.mockRejectedValue(new Error('save error'));
    mockQueryRunner.rollbackTransaction.mockRejectedValue(new Error('rollback error'));

    await expect(
      service.triggerSubmission({ projectId: 'p', oracleAddress: 'G' }),
    ).rejects.toThrow();

    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  // ── Concurrent calls — both read the same max nonce ───────────────────────
  //
  // Simulates the pre-fix race: the mock returns the same max_nonce=0 for both
  // concurrent callers so they would both compute nonce=1.  The second save
  // raises a uniqueness error.  We verify that exactly one caller succeeds and
  // the other receives an error.

  it('handles a simulated concurrent nonce collision: first call succeeds, second throws', async () => {
    let saveCallCount = 0;
    mockQueryRunner.query.mockResolvedValue([{ max_nonce: null }]); // both see same state

    mockQueryRunner.manager.save.mockImplementation(() => {
      saveCallCount += 1;
      if (saveCallCount === 1) {
        return Promise.resolve({ id: 'sub-1', nonce: 1, status: SubmissionStatus.PENDING });
      }
      // Second concurrent save hits the DB unique constraint
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

  // ── getStatus ─────────────────────────────────────────────────────────────

  it('getStatus returns counts from the repository', async () => {
    mockSubmissionRepo.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(2) // pending
      .mockResolvedValueOnce(7) // confirmed
      .mockResolvedValueOnce(1); // failed
    mockSubmissionRepo.findOne = jest.fn().mockResolvedValue(null);

    const status = await service.getStatus();

    expect(status.totalSubmissions).toBe(10);
    expect(status.pending).toBe(2);
    expect(status.confirmed).toBe(7);
    expect(status.failed).toBe(1);
  });
});
