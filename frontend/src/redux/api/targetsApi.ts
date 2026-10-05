import type { Paginated } from '../../types/api';
import type { Facets, MustWins, Target, TargetQuery } from '../../types/models';
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
  }),
});

export const {
  useGetMustWinsQuery,
  useGetTargetsQuery,
  useGetFacetsQuery,
} = targetsApi;
