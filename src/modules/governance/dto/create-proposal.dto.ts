import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';

export class CreateProposalDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @MaxLength(50)
  actionType: string;

  @IsOptional()
  @IsObject()
  actionParams?: Record<string, unknown>;
}
