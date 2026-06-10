import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { User, UserRole } from '../users/entities/user.entity';
import { Keypair } from '@stellar/stellar-sdk';

@Injectable()
export class AuthService {
  private challenges = new Map<string, { challenge: string; expiresAt: Date }>();

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateChallenge(wallet: string): { challenge: string; expiresAt: Date } {
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    this.challenges.set(wallet.toLowerCase(), { challenge, expiresAt });
    return { challenge, expiresAt };
  }

  async validateStellarSignature(
    wallet: string,
    signature: string,
    challenge: string,
  ): Promise<User | null> {
    const key = wallet.toLowerCase();
    const stored = this.challenges.get(key);
    if (!stored || stored.challenge !== challenge) return null;
    if (stored.expiresAt < new Date()) {
      this.challenges.delete(key);
      return null;
    }

    try {
      const keypair = Keypair.fromPublicKey(wallet);
      const valid = keypair.verify(
        Buffer.from(challenge),
        Buffer.from(signature, 'hex'),
      );
      if (!valid) return null;
      this.challenges.delete(key);

      const user = await this.userRepo.findOne({ where: { wallet, isActive: true } });
      return user || null;
    } catch {
      return null;
    }
  }

  async login(
    wallet: string,
    signature: string,
    challenge: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: Partial<User> }> {
    const user = await this.validateStellarSignature(wallet, signature, challenge);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    const tokens = await this.generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await this.userRepo.save(user);

    const { refreshToken: _, ...userData } = user;
    return { ...tokens, user: userData };
  }

  async register(
    wallet: string,
    signature: string,
    challenge: string,
    email?: string,
    displayName?: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: Partial<User> }> {
    const key = wallet.toLowerCase();
    const stored = this.challenges.get(key);
    if (!stored || stored.challenge !== challenge) {
      throw new BadRequestException('Invalid challenge');
    }
    if (stored.expiresAt < new Date()) {
      this.challenges.delete(key);
      throw new BadRequestException('Challenge expired');
    }

    try {
      const keypair = Keypair.fromPublicKey(wallet);
      const valid = keypair.verify(
        Buffer.from(challenge),
        Buffer.from(signature, 'hex'),
      );
      if (!valid) throw new UnauthorizedException('Invalid signature');
    } catch {
      throw new UnauthorizedException('Invalid signature');
    }
    this.challenges.delete(key);

    const existing = await this.userRepo.findOne({ where: { wallet } });
    if (existing) throw new ConflictException('Wallet already registered');

    const user = this.userRepo.create({
      wallet,
      email: email || null,
      displayName: displayName || null,
      role: UserRole.FARMER,
    });
    await this.userRepo.save(user);

    const tokens = await this.generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await this.userRepo.save(user);

    const { refreshToken: _, ...userData } = user;
    return { ...tokens, user: userData };
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const secret = this.configService.get<string>('jwt.secret');
      const payload = this.jwtService.verify(refreshToken, { secret });
      const user = await this.userRepo.findOne({
        where: { id: payload.sub, isActive: true },
      });
      if (!user || user.refreshToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const tokens = await this.generateTokens(user);
      user.refreshToken = tokens.refreshToken;
      await this.userRepo.save(user);
      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    await this.userRepo.update(userId, { refreshToken: null });
  }

  private async generateTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: user.id, wallet: user.wallet, role: user.role };
    const expiresIn = this.configService.get<string>('jwt.expiration') || '7d';
    const secret = this.configService.get<string>('jwt.secret');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn }),
      this.jwtService.signAsync(payload, { expiresIn: '30d', secret }),
    ]);
    return { accessToken, refreshToken };
  }
}
