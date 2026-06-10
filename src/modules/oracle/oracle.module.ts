import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OracleController } from './oracle.controller';
import { OracleService } from './oracle.service';
import { OracleSubmission } from './entities/oracle-submission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OracleSubmission])],
  controllers: [OracleController],
  providers: [OracleService],
  exports: [OracleService, TypeOrmModule],
})
export class OracleModule {}
