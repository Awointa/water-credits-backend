import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { Proposal } from './entities/proposal.entity';
import { ProposalVote } from './entities/proposal-vote.entity';
import { GovernanceConfig } from './entities/governance-config.entity';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Proposal, ProposalVote, GovernanceConfig]),
    // StellarModule is @Global() but we import it explicitly here so the
    // dependency is visible in the module graph and to avoid relying on
    // implicit global resolution.
    StellarModule,
  ],
  controllers: [GovernanceController],
  providers: [GovernanceService],
  exports: [GovernanceService, TypeOrmModule],
})
export class GovernanceModule {}
