import axios from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { API_URL, BRAND_HEADER, FORBIDDEN_EVENT, IMPERSONATE_HEADER, REQUEST_ID_HEADER } from '../constants/constant';
import { LABELS } from '../constants/labels';
import type { ApiError, Pagination, UnwrappedResponse } from '../types/api';

/**
 * The single axios instance. There is no login and no token: Posit Connect
 * injects the identity header upstream (the Vite proxy does it in dev).
 * Interceptors attach the correlation id and the impersonation header, unwrap
 * the Mosaic envelope, and normalise every failure to `ApiError`.
 */

let impersonationGetter: () => string | null = () => null;
let brandGetter: () => string | null = () => null;

/** Wired by the store so the interceptor always reads the live Redux value. */
export const registerImpersonationGetter = (getter: () => string | null): void => {
  impersonationGetter = getter;
};

/** Wired by the store: the selected brand (null = the server picks the user's default). */
export const registerBrandGetter = (getter: () => string | null): void => {
  brandGetter = getter;
};

export const generateRequestId = (): string => crypto.randomUUID();

export const attachRequestHeaders = (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
  config.headers.set(REQUEST_ID_HEADER, generateRequestId());
  const impersonated = impersonationGetter();
  if (impersonated) config.headers.set(IMPERSONATE_HEADER, impersonated);
  else config.headers.delete(IMPERSONATE_HEADER);
  const brand = brandGetter();
  if (brand) config.headers.set(BRAND_HEADER, brand);
  else config.headers.delete(BRAND_HEADER);
  return config;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readPagination = (body: Record<string, unknown>): Pagination | null => {
  const { page, limit, total_pages, total_items } = body;
  if (typeof page !== 'number' || typeof total_items !== 'number') return null;
  return {
    page,
    limit: typeof limit === 'number' ? limit : 0,
    total_pages: typeof total_pages === 'number' ? total_pages : 0,
    total_items,
  };
};

/** Replaces `response.data` (the envelope) with `{data, message, pagination}`. */
export const unwrapEnvelope = (response: AxiosResponse): AxiosResponse => {
  const body: unknown = response.data;
  if (!isRecord(body) || !('data' in body)) {
    response.data = { data: body ?? null, message: '', pagination: null } satisfies UnwrappedResponse<unknown>;
    return response;
  }
  response.data = {
    data: body.data ?? null,
    message: typeof body.message === 'string' ? body.message : '',
    pagination: readPagination(body),
  } satisfies UnwrappedResponse<unknown>;
  return response;
};

const errorMessage = (body: unknown, status: number | undefined, fallback: string): string => {
  if (isRecord(body) && typeof body.message === 'string' && body.message.trim()) return body.message;
  if (isRecord(body) && typeof body.detail === 'string' && body.detail.trim()) return body.detail;
  if (status === 403) return LABELS.app.forbidden;
  return fallback;
};

export const normalizeError = (error: unknown): ApiError => {
  if (!axios.isAxiosError(error)) {
    return { status: 'NETWORK_ERROR', message: error instanceof Error ? error.message : LABELS.app.genericError, data: null, requestId: null };
  }
  const response = error.response;
  if (!response) {
    return { status: 'NETWORK_ERROR', message: LABELS.app.networkError, data: null, requestId: null };
  }
  const body: unknown = response.data;
  const requestId = (response.headers?.[REQUEST_ID_HEADER.toLowerCase()] as string | undefined) ?? null;
  return {
    status: response.status,
    message: errorMessage(body, response.status, LABELS.app.genericError),
    data: isRecord(body) && 'data' in body ? body.data : null,
    requestId,
  };
};

export const rejectNormalized = (error: unknown): Promise<never> => {
  const normalized = normalizeError(error);
  if (normalized.status === 403) {
    window.dispatchEvent(new CustomEvent(FORBIDDEN_EVENT, { detail: normalized }));
  }
  return Promise.reject(normalized);
};

const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

axiosInstance.interceptors.request.use(attachRequestHeaders);
axiosInstance.interceptors.response.use(unwrapEnvelope, rejectNormalized);

export default axiosInstance;
