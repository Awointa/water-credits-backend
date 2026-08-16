import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { OracleController } from './oracle.controller';
import { OracleService } from './oracle.service';
import { OracleProcessor } from './oracle-processor';
import { OracleSubmission } from './entities/oracle-submission.entity';
import { SensorReading } from '../sensors/entities/sensor-reading.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OracleSubmission, SensorReading]),
    BullModule.registerQueue({
      name: 'oracle-submit',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 10000,
        },
        removeOnComplete: 50,
      },
    }),
  ],
  controllers: [OracleController],
  providers: [OracleService, OracleProcessor],
  exports: [OracleService, TypeOrmModule],
})
export class OracleModule {}
