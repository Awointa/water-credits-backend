import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Standard query-string pagination parameters.
 *
 * Usage in a controller:
 *   @Get()
 *   findAll(@Query() pagination: PaginationDto) { ... }
 *
 * Usage in a service (TypeORM):
 *   qb.skip(pagination.skip).take(pagination.take)
 */
export class PaginationDto {
  /** 1-indexed page number (default: 1) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  /** Maximum items per page (default: 20, max: 100) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 20;

  /**
   * Row offset for use with TypeORM's `.skip()`.
   * Derived from `page` and `limit`.
   */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /**
   * Alias for `limit`, for use with TypeORM's `.take()`.
   */
  get take(): number {
    return this.limit;
  }

  /**
   * Build a pagination meta object for the response envelope.
   *
   * @param total - total number of matching records
   */
  meta(total: number): PaginationMeta {
    return {
      page: this.page,
      limit: this.limit,
      total,
      totalPages: Math.ceil(total / this.limit),
      hasNextPage: this.page < Math.ceil(total / this.limit),
      hasPrevPage: this.page > 1,
    };
  }
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Generic paginated result wrapper used by service methods.
 */
export class PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;

  constructor(data: T[], meta: PaginationMeta) {
    this.data = data;
    this.meta = meta;
  }

  static of<T>(data: T[], total: number, pagination: PaginationDto): PaginatedResult<T> {
    return new PaginatedResult(data, pagination.meta(total));
  }
}
