import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { Proposal } from './entities/proposal.entity';
import { ProposalVote } from './entities/proposal-vote.entity';
import { GovernanceConfig } from './entities/governance-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Proposal, ProposalVote, GovernanceConfig])],
  controllers: [GovernanceController],
  providers: [GovernanceService],
  exports: [GovernanceService, TypeOrmModule],
})
export class GovernanceModule {}
