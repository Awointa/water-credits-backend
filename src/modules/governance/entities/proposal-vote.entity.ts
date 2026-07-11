import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Proposal } from './proposal.entity';

/**
 * Tracks individual votes cast on a governance proposal.
 *
 * The UNIQUE(proposal_id, voter_wallet) constraint prevents double-voting
 * at the database level, complementing application-layer checks.
 */
@Entity('proposal_votes')
@Unique(['proposalId', 'voterWallet'])
export class ProposalVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'proposal_id' })
  @Index()
  proposalId: string;

  @ManyToOne(() => Proposal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposal_id' })
  proposal: Proposal;

  @Column({ name: 'voter_wallet', type: 'varchar', length: 56 })
  @Index()
  voterWallet: string;

  /** true = vote for, false = vote against */
  @Column({ type: 'boolean' })
  support: boolean;

  /** Voting weight (default 1, may be token-weighted in future) */
  @Column({ type: 'bigint', default: 1 })
  weight: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
