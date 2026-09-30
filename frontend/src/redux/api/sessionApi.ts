import { EMPLOYEE_SEARCH_LIMIT } from '../../constants/constant';
import type { Employee, Me, Reference } from '../../types/models';
import { TAGS, baseApi } from './baseApi';

export const sessionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMe: build.query<Me, void>({
      query: () => ({ url: '/me' }),
      providesTags: [TAGS.ME],
    }),
    /** Lookups rarely change: loaded once per session and kept. */
    getReference: build.query<Reference, void>({
      query: () => ({ url: '/reference' }),
      keepUnusedDataFor: 24 * 60 * 60,
    }),
    searchEmployees: build.query<Employee[], string>({
      query: (q) => ({ url: '/employees/search', params: { q, limit: EMPLOYEE_SEARCH_LIMIT } }),
      keepUnusedDataFor: 30,
    }),
    startImpersonation: build.mutation<Employee, string>({
      query: (employeeId) => ({ url: '/impersonation', method: 'POST', data: { employee_id: employeeId } }),
    }),
    endImpersonation: build.mutation<null, void>({
      query: () => ({ url: '/impersonation', method: 'DELETE' }),
    }),
  }),
});

export const {
  useGetMeQuery,
  useGetReferenceQuery,
  useSearchEmployeesQuery,
  useLazySearchEmployeesQuery,
  useStartImpersonationMutation,
  useEndImpersonationMutation,
} = sessionApi;
