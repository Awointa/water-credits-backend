import { IsOptional, IsString, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ProjectStatus } from '../entities/project.entity';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class QueryProjectsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsString()
  methodology?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  radius?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}
