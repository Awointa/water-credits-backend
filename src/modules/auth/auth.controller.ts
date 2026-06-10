import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChallengeRequestDto, ChallengeResponseDto } from './dto/challenge.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { RateLimitGuard, RateLimit } from './guards/rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(10, 60_000)
  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  challenge(@Body() dto: ChallengeRequestDto): ChallengeResponseDto {
    return this.authService.generateChallenge(dto.wallet);
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(60, 60_000)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto.wallet, dto.signature, dto.challenge);
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(60, 60_000)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(
      dto.wallet,
      dto.signature,
      dto.challenge,
      dto.email,
      dto.displayName,
    );
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(60, 60_000)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser('id') userId: string): Promise<void> {
    return this.authService.logout(userId);
  }
}
