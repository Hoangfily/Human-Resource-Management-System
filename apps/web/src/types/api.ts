/**
 * Chuẩn hóa API Response & Error theo docs/01-api-contract.md
 */

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown> | string[];
  requestId?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;
  total?: number;
}

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
  requestId?: string;
}
