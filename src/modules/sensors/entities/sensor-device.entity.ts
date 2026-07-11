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

  /**
   * bcrypt hash of the device's pre-shared API key secret.
   * The plaintext is only returned once at registration time.
   */
  @Column({ name: 'api_key_hash', type: 'text', nullable: true, select: false })
  apiKeyHash: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_reading_at', type: 'timestamptz', nullable: true })
  lastReadingAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
