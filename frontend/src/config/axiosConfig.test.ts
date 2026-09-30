import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FORBIDDEN_EVENT, IMPERSONATE_HEADER, REQUEST_ID_HEADER } from '../constants/constant';
import { axiosBaseQuery } from '../redux/api/axiosBaseQuery';
import axiosInstance, { attachRequestHeaders, normalizeError, registerImpersonationGetter, rejectNormalized, unwrapEnvelope } from './axiosConfig';

const config = (): InternalAxiosRequestConfig => ({ headers: new AxiosHeaders() }) as InternalAxiosRequestConfig;
const response = (data: unknown, status = 200): AxiosResponse => ({ data, status, statusText: '', headers: {}, config: config() });
const httpError = (status: number, data: unknown) => new AxiosError('fail', 'ERR', config(), null, response(data, status));

afterEach(() => registerImpersonationGetter(() => null));

describe('request interceptor', () => {
  it('attaches a UUID request id and no impersonation header by default', () => {
    const out = attachRequestHeaders(config());
    expect(String(out.headers.get(REQUEST_ID_HEADER))).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.headers.get(IMPERSONATE_HEADER)).toBeFalsy();
  });
  it('attaches the impersonated employee id from the store', () => {
    registerImpersonationGetter(() => 'p250611');
    expect(attachRequestHeaders(config()).headers.get(IMPERSONATE_HEADER)).toBe('p250611');
  });
  it('generates a new id per request', () => {
    const a = attachRequestHeaders(config()).headers.get(REQUEST_ID_HEADER);
    const b = attachRequestHeaders(config()).headers.get(REQUEST_ID_HEADER);
    expect(a).not.toBe(b);
  });
});

describe('response interceptor', () => {
  it('unwraps the envelope with pagination', () => {
    const out = unwrapEnvelope(response({ data: [1, 2], status: 200, message: 'ok', page: 1, limit: 10, total_pages: 3, total_items: 25 }));
    expect(out.data).toEqual({ data: [1, 2], message: 'ok', pagination: { page: 1, limit: 10, total_pages: 3, total_items: 25 } });
  });
  it('keeps non-envelope bodies as data', () => {
    expect(unwrapEnvelope(response('plain')).data).toEqual({ data: 'plain', message: '', pagination: null });
  });
  it('normalises HTTP, network and unknown errors', () => {
    expect(normalizeError(httpError(409, { data: { flags: [] }, message: 'Flagged', status: 409 }))).toMatchObject({ status: 409, message: 'Flagged', data: { flags: [] } });
    expect(normalizeError(new AxiosError('down', 'ERR_NETWORK', config()))).toMatchObject({ status: 'NETWORK_ERROR' });
    expect(normalizeError(new Error('boom'))).toMatchObject({ status: 'NETWORK_ERROR', message: 'boom' });
  });
  it('raises the forbidden event on 403', async () => {
    const listener = vi.fn();
    window.addEventListener(FORBIDDEN_EVENT, listener);
    await expect(rejectNormalized(httpError(403, { message: 'Your account is not set up for POVO AI Guidance' }))).rejects.toMatchObject({ status: 403 });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(FORBIDDEN_EVENT, listener);
  });
});

describe('axiosBaseQuery', () => {
  const api = { signal: new AbortController().signal } as never;
  it('prefixes /api/v1 and returns data', async () => {
    const spy = vi.spyOn(axiosInstance, 'request').mockResolvedValue({ data: { data: { ok: true }, message: '', pagination: null } });
    await expect(axiosBaseQuery()({ url: '/me' }, api, {})).resolves.toEqual({ data: { ok: true } });
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ url: '/api/v1/me', method: 'GET' });
  });
  it('returns pagination for paginated queries', async () => {
    vi.spyOn(axiosInstance, 'request').mockResolvedValue({ data: { data: [1], message: '', pagination: { page: 1, limit: 10, total_pages: 1, total_items: 1 } } });
    await expect(axiosBaseQuery()({ url: '/targets', paginated: true }, api, {})).resolves.toEqual({ data: { items: [1], page: 1, limit: 10, total_pages: 1, total_items: 1 } });
  });
  it('returns normalised errors', async () => {
    vi.spyOn(axiosInstance, 'request').mockRejectedValue({ status: 422, message: 'Nothing answered', data: null, requestId: null });
    await expect(axiosBaseQuery()({ url: '/calls/C1/next-call', method: 'POST' }, api, {})).resolves.toEqual({ error: { status: 422, message: 'Nothing answered', data: null, requestId: null } });
  });
});
