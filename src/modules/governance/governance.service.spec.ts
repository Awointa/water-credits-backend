import { Test, TestingModule } from '@nestjs/testing';
import { GovernanceService } from './governance.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Proposal } from './entities/proposal.entity';
import { ProposalVote } from './entities/proposal-vote.entity';
import { GovernanceConfig } from './entities/governance-config.entity';
import { ConfigService } from '@nestjs/config';

describe('GovernanceService', () => {
  let service: GovernanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GovernanceService,
        {
          provide: getRepositoryToken(Proposal),
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
            })),
          },
        },
        {
          provide: getRepositoryToken(ProposalVote),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(GovernanceConfig),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
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

    service = module.get<GovernanceService>(GovernanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
