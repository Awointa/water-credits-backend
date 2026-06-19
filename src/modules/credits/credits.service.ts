import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Retirement } from './entities/retirement.entity';
import { RetireCreditsDto } from './dto/retire-credits.dto';
import { CreditQueryDto } from './dto/credit-query.dto';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    @InjectRepository(Retirement)
    private readonly retirementRepo: Repository<Retirement>,
    @InjectQueue('retirements')
    private readonly retirementsQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async getPortfolio(userId: string): Promise<{
    totalRetired: number;
    totalValue: number;
    projects: Array<{
      projectId: string;
      projectName: string;
      retired: number;
      certificateCount: number;
    }>;
  }> {
    const retirements = await this.retirementRepo.find({
      where: { userId },
      relations: ['project'],
      order: { retiredAt: 'DESC' },
    });

    const projectMap = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        retired: number;
        certificateCount: number;
      }
    >();

    let totalRetired = 0;

    for (const r of retirements) {
      totalRetired += Number(r.amount);
      const entry = projectMap.get(r.projectId) || {
        projectId: r.projectId,
        projectName: r.project?.name ?? 'Unknown',
        retired: 0,
        certificateCount: 0,
      };
      entry.retired += Number(r.amount);
      entry.certificateCount++;
      projectMap.set(r.projectId, entry);
    }

    return {
      totalRetired,
      totalValue: 0,
      projects: Array.from(projectMap.values()),
    };
  }

  async retire(userId: string, dto: RetireCreditsDto): Promise<Retirement> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const retirement = this.retirementRepo.create({
      userId,
      projectId: dto.projectId,
      amount: dto.amount,
      purpose: dto.purpose,
      metadataUri: dto.metadataUri ?? null,
      txHash: '',
      retiredAt: new Date(),
    });

    const saved = await this.retirementRepo.save(retirement);

    await this.retirementsQueue.add(
      'process-retirement',
      {
        retirementId: saved.id,
        userId,
        projectId: dto.projectId,
        amount: dto.amount,
        purpose: dto.purpose,
      },
      {
        attempts: 5,
        backoff: { type: 'fixed', delay: 30000 },
        removeOnComplete: 100,
      },
    );

    this.logger.log(`Queued retirement ${saved.id} for user ${userId}`);
    return saved;
  }

  async getRetirements(
    userId: string,
    query: CreditQueryDto,
  ): Promise<{ data: Retirement[]; total: number; page: number; limit: number }> {
    const qb = this.retirementRepo
      .createQueryBuilder('retirement')
      .leftJoinAndSelect('retirement.project', 'project')
      .where('retirement.user_id = :userId', { userId });

    if (query.projectId) {
      qb.andWhere('retirement.project_id = :projectId', { projectId: query.projectId });
    }
    if (query.startDate) {
      qb.andWhere('retirement.retired_at >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('retirement.retired_at <= :endDate', { endDate: query.endDate });
    }

    qb.orderBy('retirement.retired_at', 'DESC');
    qb.skip(query.skip).take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page ?? 1, limit: query.limit ?? 20 };
  }

  async getCertificate(id: string, userId: string): Promise<Retirement> {
    const retirement = await this.retirementRepo.findOne({
      where: { id, userId },
      relations: ['project'],
    });
    if (!retirement) {
      throw new NotFoundException('Retirement not found');
    }
    return retirement;
  }

  async findByProject(projectId: string): Promise<Retirement[]> {
    return this.retirementRepo.find({
      where: { projectId },
      order: { retiredAt: 'DESC' },
    });
  }

  async getTotalRetired(): Promise<number> {
    const result = await this.retirementRepo
      .createQueryBuilder('retirement')
      .select('COALESCE(SUM(retirement.amount), 0)', 'total')
      .getRawOne();
    return result ? parseFloat(result.total) : 0;
  }
}
