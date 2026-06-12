import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ProposalStatus } from '../entities/proposal.entity';

export class GovernanceQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;

  @IsOptional()
  @IsString()
  proposer?: string;

  @IsOptional()
  @IsString()
  actionType?: string;
}
