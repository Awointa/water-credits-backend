import { IsBoolean } from 'class-validator';

export class VoteDto {
  @IsBoolean()
  approve: boolean;
}
