import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ProposalStatus {
  ACTIVE = 'active',
  PASSED = 'passed',
  REJECTED = 'rejected',
  EXECUTED = 'executed',
  EXPIRED = 'expired',
}

@Entity('proposals')
export class Proposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 56 })
  @Index()
  proposer: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 50 })
  actionType: string;

  @Column({ name: 'action_params', type: 'jsonb', nullable: true })
  actionParams: Record<string, unknown> | null;

  @Column({ name: 'votes_for', type: 'bigint', default: 0 })
  votesFor: number;

  @Column({ name: 'votes_against', type: 'bigint', default: 0 })
  votesAgainst: number;

  @Column({ type: 'enum', enum: ProposalStatus, default: ProposalStatus.ACTIVE })
  status: ProposalStatus;

  @Column({ type: 'timestamptz' })
  deadline: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
