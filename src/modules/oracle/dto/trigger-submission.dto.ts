import { IsString, IsOptional, IsObject } from 'class-validator';

export class TriggerSubmissionDto {
  @IsString()
  projectId: string;

  @IsString()
  oracleAddress: string;

  @IsOptional()
  @IsObject()
  readings?: Record<string, number>;
}
