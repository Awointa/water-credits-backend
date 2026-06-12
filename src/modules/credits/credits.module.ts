import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditsRetirementProcessor } from './credits-retirement.processor';
import { Retirement } from './entities/retirement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Retirement]),
    BullModule.registerQueue({
      name: 'retirements',
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'fixed',
          delay: 30000,
        },
        removeOnComplete: 100,
      },
    }),
  ],
  controllers: [CreditsController],
  providers: [CreditsService, CreditsRetirementProcessor],
  exports: [CreditsService, TypeOrmModule],
})
export class CreditsModule {}
