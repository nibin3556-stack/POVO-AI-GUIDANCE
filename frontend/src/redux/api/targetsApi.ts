import type { Paginated } from '../../types/api';
import type { Account, Facets, MustWins, PageQuery, Target, TargetQuery } from '../../types/models';
import { filterParams } from '../../utils/targets';
import { TAGS, baseApi } from './baseApi';

export const targetsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMustWins: build.query<MustWins, void>({
      query: () => ({ url: '/targets/must-wins' }),
      providesTags: [TAGS.TARGETS],
    }),
    getTargets: build.query<Paginated<Target>, TargetQuery>({
      query: ({ filters, page, limit, sort }) => ({
        url: '/targets',
        params: { page, limit, sort, ...filterParams(filters) },
        paginated: true,
      }),
      providesTags: [TAGS.TARGETS],
    }),
    getFacets: build.query<Facets, void>({
      query: () => ({ url: '/targets/facets' }),
      providesTags: [TAGS.TARGETS],
    }),
    getAccounts: build.query<Paginated<Account>, PageQuery>({
      query: ({ page, limit, sort }) => ({ url: '/accounts', params: { page, limit, sort }, paginated: true }),
      providesTags: [TAGS.ACCOUNTS],
    }),
    getAccountTargets: build.query<Target[], string>({
      query: (accountId) => ({ url: `/accounts/${encodeURIComponent(accountId)}/targets` }),
      providesTags: [TAGS.ACCOUNTS],
    }),
  }),
});

export const {
  useGetMustWinsQuery,
  useGetTargetsQuery,
  useGetFacetsQuery,
  useGetAccountsQuery,
  useGetAccountTargetsQuery,
} = targetsApi;
