import { Test, TestingModule } from '@nestjs/testing';
import { OracleController } from './oracle.controller';
import { OracleService } from './oracle.service';
import { OracleQueryDto } from './dto/oracle-query.dto';
import { TriggerSubmissionDto } from './dto/trigger-submission.dto';

describe('OracleController', () => {
  let controller: OracleController;
  let service: jest.Mocked<OracleService>;

  const mockStatus = {
    totalSubmissions: 10,
    pending: 3,
    confirmed: 5,
    failed: 2,
    lastSubmission: null,
  };

  const mockSubmission = {
    id: 'sub-1',
    projectId: 'proj-1',
    oracleAddress: 'GABCD...',
    nonce: 1,
    txHash: 'tx-hash',
    status: 'pending',
    readingsSnapshot: {},
    result: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  } as any;

  const mockAggregatedReading = {
    medianPh: 7.0,
    medianTurbidity: 2.5,
    medianDissolvedOxygen: 8.0,
    medianFlowRate: 10.0,
    medianNitrogen: 0.5,
    medianPhosphorus: 0.1,
    medianTemperature: 22.0,
    oracleCount: 3,
    startTime: new Date('2026-01-01'),
    endTime: new Date('2026-01-02'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OracleController],
      providers: [
        {
          provide: OracleService,
          useValue: {
            getStatus: jest.fn(),
            getSubmissions: jest.fn(),
            getPendingSubmissions: jest.fn(),
            triggerSubmission: jest.fn(),
            aggregateReadings: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OracleController>(OracleController);
    service = module.get(OracleService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return the service status', async () => {
      service.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus();

      expect(service.getStatus).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockStatus);
    });
  });

  describe('getSubmissions', () => {
    it('should return paginated submissions', async () => {
      const query: OracleQueryDto = { page: 1, limit: 20, projectId: 'proj-1' } as any;
      const serviceResult = { data: [mockSubmission], total: 1, page: 1, limit: 20 };
      service.getSubmissions.mockResolvedValue(serviceResult);

      const result = await controller.getSubmissions(query);

      expect(service.getSubmissions).toHaveBeenCalledWith(query);
      expect(result).toMatchObject({
        success: true,
        data: [mockSubmission],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    });
  });

  describe('getPending', () => {
    it('should return pending submissions', async () => {
      service.getPendingSubmissions.mockResolvedValue([mockSubmission]);

      const result = await controller.getPending();

      expect(service.getPendingSubmissions).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockSubmission]);
    });
  });

  describe('triggerSubmission', () => {
    it('should trigger a submission and return it', async () => {
      const dto: TriggerSubmissionDto = {
        projectId: 'proj-1',
        oracleAddress: 'GABCD...',
        readings: { ph: 7.0 },
      };
      service.triggerSubmission.mockResolvedValue(mockSubmission);

      const result = await controller.triggerSubmission(dto);

      expect(service.triggerSubmission).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockSubmission);
    });
  });

  describe('aggregateReadings', () => {
    it('should aggregate readings for a project without date range', async () => {
      service.aggregateReadings.mockResolvedValue(mockAggregatedReading);

      const result = await controller.aggregateReadings('proj-1');

      expect(service.aggregateReadings).toHaveBeenCalledWith('proj-1', undefined, undefined);
      expect(result).toEqual(mockAggregatedReading);
    });

    it('should aggregate readings with startTime and endTime parsed as Date', async () => {
      const startTime = '2026-01-01T00:00:00Z';
      const endTime = '2026-01-02T00:00:00Z';
      service.aggregateReadings.mockResolvedValue(mockAggregatedReading);

      const result = await controller.aggregateReadings('proj-1', startTime, endTime);

      expect(service.aggregateReadings).toHaveBeenCalledWith(
        'proj-1',
        new Date(startTime),
        new Date(endTime),
      );
      expect(result).toEqual(mockAggregatedReading);
    });

    it('should aggregate readings with only startTime', async () => {
      const startTime = '2026-01-01T00:00:00Z';
      service.aggregateReadings.mockResolvedValue(mockAggregatedReading);

      const result = await controller.aggregateReadings('proj-1', startTime);

      expect(service.aggregateReadings).toHaveBeenCalledWith(
        'proj-1',
        new Date(startTime),
        undefined,
      );
      expect(result).toEqual(mockAggregatedReading);
    });
  });
});
