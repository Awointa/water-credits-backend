export class ApiResponseDto<T = any> {
  success: boolean;
  data: T;
  timestamp: string;
  statusCode: number;

  static ok<T>(data: T, statusCode = 200): ApiResponseDto<T> {
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      statusCode,
    };
  }
}

export class PaginatedResponseDto<T = any> {
  success: boolean;
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  timestamp: string;

  static from<T>(data: T[], total: number, page: number, limit: number): PaginatedResponseDto<T> {
    return {
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
