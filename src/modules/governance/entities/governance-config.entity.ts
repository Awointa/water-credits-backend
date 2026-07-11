import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

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

  // ── Water-quality thresholds (used by oracle scoring) ──

  @Column({ name: 'ph_min', type: 'numeric', precision: 5, scale: 2, nullable: true })
  phMin: number | null;

  @Column({ name: 'ph_max', type: 'numeric', precision: 5, scale: 2, nullable: true })
  phMax: number | null;

  @Column({ name: 'do_threshold', type: 'numeric', precision: 5, scale: 2, nullable: true })
  doThreshold: number | null;

  @Column({ name: 'temp_penalty_delta', type: 'numeric', precision: 5, scale: 2, nullable: true })
  tempPenaltyDelta: number | null;

  // ── Credit-weight parameters ──

  @Column({ name: 'weight_volumetric', type: 'numeric', precision: 5, scale: 4, default: 0.5 })
  weightVolumetric: number;

  @Column({ name: 'weight_nitrogen', type: 'numeric', precision: 5, scale: 4, default: 0.3 })
  weightNitrogen: number;

  @Column({ name: 'weight_phosphorus', type: 'numeric', precision: 5, scale: 4, default: 0.2 })
  weightPhosphorus: number;

  @Column({ name: 'updated_by', type: 'varchar', length: 56, nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
