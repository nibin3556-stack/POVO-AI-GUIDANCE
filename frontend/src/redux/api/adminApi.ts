import type { FeatureCode } from '../../constants/constant';
import type { AdminBrand, BrandFeatures, BrandSaveBody } from '../../types/models';
import { TAGS, baseApi } from './baseApi';

/** Brand and feature configuration (users in the backend's admin users file only). */
export const adminApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminMe: build.query<{ username: string | null; is_admin: boolean }, void>({
      query: () => ({ url: '/admin/me' }),
    }),
    getAdminBrands: build.query<AdminBrand[], void>({
      query: () => ({ url: '/admin/brands' }),
      providesTags: [TAGS.ADMIN],
    }),
    getBrandFeatures: build.query<BrandFeatures, string>({
      query: (code) => ({ url: `/admin/brands/${encodeURIComponent(code)}/features` }),
      providesTags: [TAGS.ADMIN],
    }),
    saveBrand: build.mutation<AdminBrand, BrandSaveBody>({
      query: (data) => ({ url: '/admin/brands', method: 'POST', data }),
      // The brand list in /me changes too (name, active).
      invalidatesTags: [TAGS.ADMIN, TAGS.ME],
    }),
    saveBrandFeatures: build.mutation<BrandFeatures, { code: string; features: Partial<Record<FeatureCode, boolean>> }>({
      query: ({ code, features }) => ({ url: `/admin/brands/${encodeURIComponent(code)}/features`, method: 'PUT', data: { features } }),
      invalidatesTags: [TAGS.ADMIN, TAGS.ME],
    }),
  }),
});

export const {
  useGetAdminMeQuery,
  useGetAdminBrandsQuery,
  useGetBrandFeaturesQuery,
  useSaveBrandMutation,
  useSaveBrandFeaturesMutation,
} = adminApi;
