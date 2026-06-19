import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

@Processor('sensor-ingestion')
export class SensorsIngestionProcessor {
  private readonly logger = new Logger(SensorsIngestionProcessor.name);

  @Process({
    concurrency: 5,
  })
  async processReading(
    job: Job<{ deviceId: string; projectId: string; readingId: string }>,
  ): Promise<void> {
    this.logger.debug(`Processing reading ${job.data.readingId} from device ${job.data.deviceId}`);
  }
}
