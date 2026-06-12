import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { SubmissionStatus } from '../entities/oracle-submission.entity';

export class OracleQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  oracleAddress?: string;

  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
