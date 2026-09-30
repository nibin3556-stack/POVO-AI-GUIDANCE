/** The Mosaic envelope every endpoint returns (ARCHITECTURE §5). */
export interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
  page: number | null;
  limit: number | null;
  total_pages: number | null;
  total_items: number | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total_pages: number;
  total_items: number;
}

/** What the response interceptor leaves on `response.data` after unwrapping the envelope. */
export interface UnwrappedResponse<T> {
  data: T;
  message: string;
  pagination: Pagination | null;
}

export interface Paginated<T> extends Pagination {
  items: T[];
}

/** Every failed request is normalised to this shape (RTK Query `error`). */
export interface ApiError {
  status: number | 'NETWORK_ERROR';
  message: string;
  data: unknown;
  requestId: string | null;
}
