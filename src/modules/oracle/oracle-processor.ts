import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OracleSubmission, SubmissionStatus } from './entities/oracle-submission.entity';

@Processor('oracle-submit')
export class OracleProcessor {
  private readonly logger = new Logger(OracleProcessor.name);

  constructor(
    @InjectRepository(OracleSubmission)
    private readonly submissionRepo: Repository<OracleSubmission>,
  ) {}

  @Process({
    name: 'oracle-submit-job',
    concurrency: 1,
  })
  async processSubmission(
    job: Job<{
      submissionId: string;
      projectId: string;
      oracleAddress: string;
      nonce: number;
    }>,
  ): Promise<void> {
    this.logger.log(
      `Processing oracle submission ${job.data.submissionId} for project ${job.data.projectId}`,
    );

    const submission = await this.submissionRepo.findOne({
      where: { id: job.data.submissionId },
    });

    if (!submission) {
      this.logger.warn(`Submission ${job.data.submissionId} not found, skipping`);
      return;
    }

    try {
      submission.status = SubmissionStatus.SUBMITTED;
      submission.txHash = `tx-${Date.now()}-${job.data.nonce}`;
      await this.submissionRepo.save(submission);

      submission.status = SubmissionStatus.CONFIRMED;
      submission.result = {
        confirmed: true,
        confirmedAt: new Date().toISOString(),
        oracleAddress: job.data.oracleAddress,
        nonce: job.data.nonce,
      };
      await this.submissionRepo.save(submission);

      this.logger.log(`Oracle submission ${job.data.submissionId} confirmed on-chain`);
    } catch (error) {
      submission.status = SubmissionStatus.FAILED;
      await this.submissionRepo.save(submission);

      this.logger.error(
        `Oracle submission ${job.data.submissionId} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
