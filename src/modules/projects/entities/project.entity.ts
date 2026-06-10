import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ProjectStatus {
  DRAFT = 'draft',
  REGISTERED = 'registered',
  BASELINE = 'baseline',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CLOSED = 'closed',
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  @Index()
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  longitude: number;

  @Column({ type: 'varchar', length: 100 })
  methodology: string;

  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.DRAFT })
  status: ProjectStatus;

  @Column({ name: 'area_hectares', type: 'decimal', precision: 12, scale: 2 })
  areaHectares: number;

  @Column({ name: 'credit_token_address', type: 'varchar', length: 56, nullable: true })
  creditTokenAddress: string | null;

  @Column({ name: 'contract_id', type: 'varchar', length: 56, nullable: true })
  contractId: string | null;

  @Column({ name: 'baseline_start_date', type: 'timestamptz', nullable: true })
  baselineStartDate: Date | null;

  @Column({ name: 'baseline_end_date', type: 'timestamptz', nullable: true })
  baselineEndDate: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
