import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { User, UserRole } from '../users/entities/user.entity';
import { Keypair } from '@stellar/stellar-sdk';

const CHALLENGE_TTL_SECONDS = 5 * 60; // 5 minutes
const CHALLENGE_KEY_PREFIX = 'auth:challenge:';

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private redis: Redis;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.redis = new Redis({
      host: this.configService.get<string>('queue.redisHost', 'localhost'),
      port: this.configService.get<number>('queue.redisPort', 6379),
      password: this.configService.get<string>('queue.redisPassword') || undefined,
      // Isolated DB (default is 0) so challenge keys don't collide with queue data
      db: this.configService.get<number>('REDIS_AUTH_DB', 1),
      lazyConnect: true,
      enableReadyCheck: false,
    });
    this.redis.on('error', (err) => this.logger.warn(`Redis auth client error: ${err.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  // ── Challenge ─────────────────────────────────────────────────────────────

  generateChallenge(wallet: string): { challenge: string; expiresAt: Date } {
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);

    // Persist asynchronously — fire and forget (errors logged above)
    const key = `${CHALLENGE_KEY_PREFIX}${wallet.toLowerCase()}`;
    this.redis
      .set(key, challenge, 'EX', CHALLENGE_TTL_SECONDS)
      .catch((err) => this.logger.error(`Failed to store challenge in Redis: ${err.message}`));

    return { challenge, expiresAt };
  }

  // ── Signature validation ───────────────────────────────────────────────────

  async validateStellarSignature(
    wallet: string,
    signature: string,
    challenge: string,
  ): Promise<User | null> {
    const key = `${CHALLENGE_KEY_PREFIX}${wallet.toLowerCase()}`;

    // Atomically fetch + delete so the challenge can only be used once,
    // even under concurrent requests (GETDEL is Redis ≥ 6.2)
    let storedChallenge: string | null;
    try {
      storedChallenge = await this.redis.getdel(key);
    } catch (err) {
      // Fall back to GET + DEL on older Redis versions
      this.logger.warn(`GETDEL failed, falling back to GET+DEL: ${(err as Error).message}`);
      storedChallenge = await this.redis.get(key);
      if (storedChallenge) {
        await this.redis.del(key);
      }
    }

    if (!storedChallenge || storedChallenge !== challenge) {
      return null;
    }

    try {
      const keypair = Keypair.fromPublicKey(wallet);
      const valid = keypair.verify(Buffer.from(challenge), Buffer.from(signature, 'hex'));
      if (!valid) {
        return null;
      }

      const user = await this.userRepo.findOne({ where: { wallet, isActive: true } });
      return user ?? null;
    } catch {
      return null;
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(
    wallet: string,
    signature: string,
    challenge: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: Partial<User> }> {
    const user = await this.validateStellarSignature(wallet, signature, challenge);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const tokens = await this.generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await this.userRepo.save(user);

    return { ...tokens, user: { ...user } };
  }

  // ── Register ──────────────────────────────────────────────────────────────

  async register(
    wallet: string,
    signature: string,
    challenge: string,
    email?: string,
    displayName?: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: Partial<User> }> {
    const key = `${CHALLENGE_KEY_PREFIX}${wallet.toLowerCase()}`;

    let storedChallenge: string | null;
    try {
      storedChallenge = await this.redis.getdel(key);
    } catch {
      storedChallenge = await this.redis.get(key);
      if (storedChallenge) {
        await this.redis.del(key);
      }
    }

    if (!storedChallenge || storedChallenge !== challenge) {
      throw new BadRequestException('Invalid or expired challenge');
    }

    try {
      const keypair = Keypair.fromPublicKey(wallet);
      const valid = keypair.verify(Buffer.from(challenge), Buffer.from(signature, 'hex'));
      if (!valid) {
        throw new UnauthorizedException('Invalid signature');
      }
    } catch {
      throw new UnauthorizedException('Invalid signature');
    }

    const existing = await this.userRepo.findOne({ where: { wallet } });
    if (existing) {
      throw new ConflictException('Wallet already registered');
    }

    const user = this.userRepo.create({
      wallet,
      email: email ?? null,
      displayName: displayName ?? null,
      role: UserRole.FARMER,
    });
    await this.userRepo.save(user);

    const tokens = await this.generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await this.userRepo.save(user);

    return { ...tokens, user: { ...user } };
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
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

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<void> {
    await this.userRepo.update(userId, { refreshToken: null });
  }

  // ── Token generation ──────────────────────────────────────────────────────

  private async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: user.id, wallet: user.wallet, role: user.role };
    const expiresIn = this.configService.get<string>('jwt.expiration') ?? '7d';
    const secret = this.configService.get<string>('jwt.secret');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn }),
      this.jwtService.signAsync(payload, { expiresIn: '30d', secret }),
    ]);
    return { accessToken, refreshToken };
  }
}
