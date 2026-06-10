import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByWallet(wallet: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { wallet } });
  }

  async findAll(
    page = 1,
    limit = 20,
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.userRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async updateProfile(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<User> {
    const user = await this.findById(userId);
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.isKycVerified !== undefined) {
      if (user.role === UserRole.ADMIN) {
        user.isKycVerified = dto.isKycVerified;
      } else {
        throw new ForbiddenException('Only admins can update KYC status');
      }
    }
    return this.userRepo.save(user);
  }

  async updateRole(
    targetUserId: string,
    dto: UpdateRoleDto,
  ): Promise<User> {
    const user = await this.findById(targetUserId);
    user.role = dto.role;
    return this.userRepo.save(user);
  }

  async softDelete(userId: string): Promise<void> {
    const result = await this.userRepo.update(userId, { isActive: false });
    if (result.affected === 0) throw new NotFoundException('User not found');
  }

  async restore(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      withDeleted: false,
    });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = true;
    return this.userRepo.save(user);
  }
}
