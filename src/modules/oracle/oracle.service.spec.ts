import { Test, TestingModule } from '@nestjs/testing';
import { OracleService } from './oracle.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OracleSubmission } from './entities/oracle-submission.entity';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';

describe('OracleService', () => {
  let service: OracleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleService,
        {
          provide: getRepositoryToken(OracleSubmission),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn(),
              getMany: jest.fn(),
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              getRawMany: jest.fn(),
            })),
          },
        },
        {
          provide: getQueueToken('oracle-submit'),
          useValue: {
            add: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OracleService>(OracleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
