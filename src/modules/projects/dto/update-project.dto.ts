import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ProjectStatus } from '../entities/project.entity';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  methodology?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  areaHectares?: number;

  @IsOptional()
  @IsDateString()
  baselineStartDate?: string;

  @IsOptional()
  @IsDateString()
  baselineEndDate?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
