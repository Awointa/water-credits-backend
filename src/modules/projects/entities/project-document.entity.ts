import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';

@Entity('project_documents')
export class ProjectDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  @Index()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'document_type', type: 'varchar', length: 50 })
  documentType: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ name: 'ipfs_uri', type: 'varchar', length: 255 })
  ipfsUri: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
