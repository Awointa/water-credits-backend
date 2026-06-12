import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Retirement } from './entities/retirement.entity';

@Processor('retirements')
export class CreditsRetirementProcessor {
  private readonly logger = new Logger(CreditsRetirementProcessor.name);

  constructor(
    @InjectRepository(Retirement)
    private readonly retirementRepo: Repository<Retirement>,
  ) {}

  @Process({
    name: 'process-retirement',
    concurrency: 2,
  })
  async processRetirement(
    job: Job<{
      retirementId: string;
      userId: string;
      projectId: string;
      amount: number;
      purpose: string;
    }>,
  ): Promise<void> {
    this.logger.log(`Processing retirement ${job.data.retirementId}`);

    const retirement = await this.retirementRepo.findOne({
      where: { id: job.data.retirementId },
    });

    if (!retirement) {
      this.logger.warn(`Retirement ${job.data.retirementId} not found, skipping`);
      return;
    }

    try {
      retirement.txHash = `tx-pending-${Date.now()}`;
      await this.retirementRepo.save(retirement);

      this.logger.log(`Retirement ${job.data.retirementId} processed successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to process retirement ${job.data.retirementId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
