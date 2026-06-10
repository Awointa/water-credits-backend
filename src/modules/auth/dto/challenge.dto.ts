import { IsString, IsNotEmpty, Length } from 'class-validator';

export class ChallengeRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(56, 56)
  wallet: string;
}

export class ChallengeResponseDto {
  challenge: string;
  expiresAt: Date;
}
