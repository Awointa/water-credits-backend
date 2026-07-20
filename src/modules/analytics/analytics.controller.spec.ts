import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: jest.Mocked<AnalyticsService>;

  const mockOverview = {
    totalProjects: 10,
    activeProjects: 7,
    totalCreditsMinted: 5000,
    totalCreditsRetired: 200,
  };

  const mockCreditsOverTime = {
    minted: [{ month: '2026-01', amount: 1000 }],
    retired: [{ month: '2026-01', amount: 500 }],
  };

  const mockProjectDistribution = {
    byStatus: [{ status: 'active', count: 5 }],
    byMethodology: [{ methodology: 'VM001', count: 3 }],
  };

  const mockRetirementByPurpose = [{ purpose: 'compliance', amount: 1000 }];

  const mockTopProjects = [{ id: 'p1', name: 'Project A', totalGenerated: 500 }];

  const mockTopRetirees = [{ id: 'u1', name: 'User A', totalRetired: 200 }];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            getOverview: jest.fn(),
            getCreditsOverTime: jest.fn(),
            getProjectDistribution: jest.fn(),
            getRetirementByPurpose: jest.fn(),
            getTopProjects: jest.fn(),
            getTopRetirees: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get(AnalyticsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOverview', () => {
    it('should return the service overview', async () => {
      service.getOverview.mockResolvedValue(mockOverview);

      const result = await controller.getOverview();

      expect(service.getOverview).toHaveBeenCalled();
      expect(result).toEqual(mockOverview);
    });
  });

  describe('getCreditsOverTime', () => {
    it('should return the time series from service', async () => {
      service.getCreditsOverTime.mockResolvedValue(mockCreditsOverTime);

      const result = await controller.getCreditsOverTime();

      expect(service.getCreditsOverTime).toHaveBeenCalled();
      expect(result).toEqual(mockCreditsOverTime);
    });
  });

  describe('getProjectDistribution', () => {
    it('should return the project distribution from service', async () => {
      service.getProjectDistribution.mockResolvedValue(mockProjectDistribution);

      const result = await controller.getProjectDistribution();

      expect(service.getProjectDistribution).toHaveBeenCalled();
      expect(result).toEqual(mockProjectDistribution);
    });
  });

  describe('getRetirementByPurpose', () => {
    it('should return the retirement purpose breakdown from service', async () => {
      service.getRetirementByPurpose.mockResolvedValue(mockRetirementByPurpose);

      const result = await controller.getRetirementByPurpose();

      expect(service.getRetirementByPurpose).toHaveBeenCalled();
      expect(result).toEqual(mockRetirementByPurpose);
    });
  });

  describe('getTopProjects', () => {
    it('should call service.getTopProjects with the provided limit', async () => {
      service.getTopProjects.mockResolvedValue(mockTopProjects);

      const result = await controller.getTopProjects(5);

      expect(service.getTopProjects).toHaveBeenCalledWith(5);
      expect(result).toEqual(mockTopProjects);
    });

    it('should call service.getTopProjects with undefined when no limit provided', async () => {
      service.getTopProjects.mockResolvedValue(mockTopProjects);

      const result = await controller.getTopProjects(undefined);

      expect(service.getTopProjects).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockTopProjects);
    });
  });

  describe('getTopRetirees', () => {
    it('should call service.getTopRetirees with the provided limit', async () => {
      service.getTopRetirees.mockResolvedValue(mockTopRetirees);

      const result = await controller.getTopRetirees(10);

      expect(service.getTopRetirees).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockTopRetirees);
    });

    it('should call service.getTopRetirees with undefined when no limit provided', async () => {
      service.getTopRetirees.mockResolvedValue(mockTopRetirees);

      const result = await controller.getTopRetirees(undefined);

      expect(service.getTopRetirees).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockTopRetirees);
    });
  });
});
