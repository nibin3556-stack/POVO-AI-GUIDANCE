import type { Deciles, Grain, Guidance, Kpis, NewWriters, Period, Segmentation } from '../../types/models';
import { TAGS, baseApi } from './baseApi';

export const performanceApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getKpis: build.query<Kpis, Period>({
      query: (period) => ({ url: '/performance/kpis', params: { period } }),
      providesTags: [TAGS.PERFORMANCE],
    }),
    getGuidance: build.query<Guidance, void>({
      query: () => ({ url: '/performance/guidance' }),
      providesTags: [TAGS.PERFORMANCE],
    }),
    getSegmentation: build.query<Segmentation, void>({
      query: () => ({ url: '/performance/segmentation' }),
      providesTags: [TAGS.PERFORMANCE],
    }),
    getDeciles: build.query<Deciles, void>({
      query: () => ({ url: '/performance/deciles' }),
      providesTags: [TAGS.PERFORMANCE],
    }),
    getNewWriters: build.query<NewWriters, Grain>({
      query: (grain) => ({ url: '/performance/new-writers', params: { grain } }),
      providesTags: [TAGS.PERFORMANCE],
    }),
  }),
});

export const {
  useGetKpisQuery,
  useGetGuidanceQuery,
  useGetSegmentationQuery,
  useGetDecilesQuery,
  useGetNewWritersQuery,
} = performanceApi;
