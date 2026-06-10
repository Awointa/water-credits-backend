import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('governance_config')
export class GovernanceConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'protocol_fee_bps', type: 'int', default: 100 })
  protocolFeeBps: number;

  @Column({ name: 'min_oracle_confirmations', type: 'int', default: 3 })
  minOracleConfirmations: number;

  @Column({ name: 'voting_period', type: 'int', default: 604800 })
  votingPeriod: number;

  @Column({ name: 'timelock_period', type: 'int', default: 86400 })
  timelockPeriod: number;

  @Column({ type: 'int', default: 3 })
  quorum: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
