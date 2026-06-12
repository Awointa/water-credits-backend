import { IsString, IsNumber, IsOptional, Min, MaxLength } from 'class-validator';

export class RetireCreditsDto {
  @IsString()
  projectId: string;

  @IsNumber()
  @Min(0.000001)
  amount: number;

  @IsString()
  @MaxLength(255)
  purpose: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metadataUri?: string;
}
