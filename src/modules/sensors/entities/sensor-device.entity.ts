import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

@Entity('sensor_devices')
export class SensorDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  @Index()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'device_id', type: 'varchar', length: 100, unique: true })
  deviceId: string;

  @Column({ type: 'varchar', length: 100 })
  manufacturer: string;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ type: 'jsonb', nullable: true })
  parameters: Record<string, unknown> | null;

  @Column({ name: 'public_key', type: 'text' })
  publicKey: string;

  @Column({ name: 'last_reading_at', type: 'timestamptz', nullable: true })
  lastReadingAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
