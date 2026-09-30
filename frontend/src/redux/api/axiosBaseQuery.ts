import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import type { AxiosRequestConfig } from 'axios';
import axiosInstance, { normalizeError } from '../../config/axiosConfig';
import { API_PREFIX } from '../../constants/constant';
import type { ApiError, UnwrappedResponse } from '../../types/api';

export interface AxiosQueryArgs {
  url: string;
  method?: AxiosRequestConfig['method'];
  data?: unknown;
  params?: AxiosRequestConfig['params'];
  /** Return `{items, page, limit, total_pages, total_items}` instead of the bare data. */
  paginated?: boolean;
  /** Absolute path (e.g. /health) instead of one under /api/v1. */
  raw?: boolean;
}

const isApiError = (value: unknown): value is ApiError =>
  typeof value === 'object' && value !== null && 'status' in value && 'message' in value && 'requestId' in value;

/** RTK Query base query over the shared axios instance (interceptors do the envelope work). */
export const axiosBaseQuery =
  (): BaseQueryFn<AxiosQueryArgs, unknown, ApiError> =>
  async ({ url, method = 'GET', data, params, paginated, raw }, api) => {
    try {
      const response = await axiosInstance.request<UnwrappedResponse<unknown>>({
        url: raw ? url : `${API_PREFIX}${url}`,
        method,
        data,
        params,
        signal: api.signal,
      });
      const body = response.data;
      if (!paginated) return { data: body.data };
      const items = Array.isArray(body.data) ? body.data : [];
      const pagination = body.pagination ?? { page: 1, limit: items.length, total_pages: 1, total_items: items.length };
      return { data: { items, ...pagination } };
    } catch (error) {
      return { error: isApiError(error) ? error : normalizeError(error) };
    }
  };
