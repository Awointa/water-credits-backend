import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project, ProjectStatus } from '../projects/entities/project.entity';
import { Retirement } from '../credits/entities/retirement.entity';
import { ReadingBatch, BatchStatus } from '../sensors/entities/reading-batch.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(Retirement)
    private retirementRepository: Repository<Retirement>,
    @InjectRepository(ReadingBatch)
    private readingBatchRepository: Repository<ReadingBatch>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getOverview() {
    const totalProjects = await this.projectRepository.count();
    const activeProjects = await this.projectRepository.count({
      where: { status: ProjectStatus.ACTIVE },
    });

    const creditsMintedResult = await this.readingBatchRepository
      .createQueryBuilder('batch')
      .select('SUM(batch.creditsGenerated)', 'total')
      .where('batch.status = :status', { status: BatchStatus.CONFIRMED })
      .getRawOne();

    const creditsRetiredResult = await this.retirementRepository
      .createQueryBuilder('retirement')
      .select('SUM(retirement.amount)', 'total')
      .getRawOne();

    return {
      totalProjects,
      activeProjects,
      totalCreditsMinted: parseFloat(creditsMintedResult?.total || '0'),
      totalCreditsRetired: parseFloat(creditsRetiredResult?.total || '0'),
    };
  }

  async getCreditsOverTime() {
    const last6Months = new Date();
    last6Months.setMonth(last6Months.getMonth() - 6);

    const minted = await this.readingBatchRepository
      .createQueryBuilder('batch')
      .select("DATE_TRUNC('month', batch.confirmed_at)", 'month')
      .addSelect('SUM(batch.credits_generated)', 'amount')
      .where('batch.status = :status', { status: BatchStatus.CONFIRMED })
      .andWhere('batch.confirmed_at >= :date', { date: last6Months })
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany();

    const retired = await this.retirementRepository
      .createQueryBuilder('retirement')
      .select("DATE_TRUNC('month', retirement.retired_at)", 'month')
      .addSelect('SUM(retirement.amount)', 'amount')
      .where('retirement.retired_at >= :date', { date: last6Months })
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany();

    return {
      minted: minted.map((m) => ({ month: m.month, amount: parseFloat(m.amount) })),
      retired: retired.map((r) => ({ month: r.month, amount: parseFloat(r.amount) })),
    };
  }

  async getProjectDistribution() {
    const byStatus = await this.projectRepository
      .createQueryBuilder('project')
      .select('project.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('project.status')
      .getRawMany();

    const byMethodology = await this.projectRepository
      .createQueryBuilder('project')
      .select('project.methodology', 'methodology')
      .addSelect('COUNT(*)', 'count')
      .groupBy('project.methodology')
      .getRawMany();

    return {
      byStatus: byStatus.map((s) => ({ status: s.status, count: parseInt(s.count) })),
      byMethodology: byMethodology.map((m) => ({
        methodology: m.methodology,
        count: parseInt(m.count),
      })),
    };
  }

  async getRetirementByPurpose() {
    const result = await this.retirementRepository
      .createQueryBuilder('retirement')
      .select('retirement.purpose', 'purpose')
      .addSelect('SUM(retirement.amount)', 'amount')
      .groupBy('retirement.purpose')
      .getRawMany();

    return result.map((r) => ({
      purpose: r.purpose,
      amount: parseFloat(r.amount),
    }));
  }

  async getTopProjects(limit: number = 5) {
    const result = await this.readingBatchRepository
      .createQueryBuilder('batch')
      .innerJoin('batch.project', 'project')
      .select('project.id', 'id')
      .addSelect('project.name', 'name')
      .addSelect('SUM(batch.credits_generated)', 'totalGenerated')
      .where('batch.status = :status', { status: BatchStatus.CONFIRMED })
      .groupBy('project.id')
      .addGroupBy('project.name')
      .orderBy('"totalGenerated"', 'DESC')
      .limit(limit)
      .getRawMany();

    return result.map((r) => ({
      id: r.id,
      name: r.name,
      totalGenerated: parseFloat(r.totalGenerated),
    }));
  }

  async getTopRetirees(limit: number = 5) {
    const result = await this.retirementRepository
      .createQueryBuilder('retirement')
      .innerJoin('retirement.user', 'user')
      .select('user.id', 'id')
      .addSelect('user.displayName', 'name')
      .addSelect('SUM(retirement.amount)', 'totalRetired')
      .groupBy('user.id')
      .addGroupBy('user.displayName')
      .orderBy('"totalRetired"', 'DESC')
      .limit(limit)
      .getRawMany();

    return result.map((r) => ({
      id: r.id,
      name: r.name,
      totalRetired: parseFloat(r.totalRetired),
    }));
  }
}
