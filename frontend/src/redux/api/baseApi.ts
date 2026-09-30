import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './axiosBaseQuery';

export const TAGS = {
  ME: 'Me',
  PERFORMANCE: 'Performance',
  TARGETS: 'Targets',
  ACCOUNTS: 'Accounts',
  PROFILE: 'Profile',
  CALL_PREP: 'CallPrep',
  CALL: 'Call',
} as const;

/** One API slice; each module injects its endpoints (redux/api/*Api.ts). */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: Object.values(TAGS),
  refetchOnMountOrArgChange: false,
  endpoints: () => ({}),
});
