import { Test, TestingModule } from '@nestjs/testing';
import { CreditsService } from './credits.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Retirement } from './entities/retirement.entity';
import { Project } from '../projects/entities/project.entity';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';

describe('CreditsService', () => {
  let service: CreditsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditsService,
        {
          provide: getRepositoryToken(Retirement),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              getRawOne: jest.fn(),
              getRawMany: jest.fn(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn(),
            })),
          },
        },
        {
          provide: getQueueToken('retirements'),
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

    service = module.get<CreditsService>(CreditsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
