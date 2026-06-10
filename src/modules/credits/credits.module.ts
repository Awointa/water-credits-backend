import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { Retirement } from './entities/retirement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Retirement])],
  controllers: [CreditsController],
  providers: [CreditsService],
  exports: [CreditsService, TypeOrmModule],
})
export class CreditsModule {}
