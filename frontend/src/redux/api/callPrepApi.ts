import type { CallPrep, CallPrepArgs, Profile } from '../../types/models';
import { TAGS, baseApi } from './baseApi';

export const callPrepApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProfile: build.query<Profile, string>({
      query: (hcpId) => ({ url: `/targets/${encodeURIComponent(hcpId)}/profile` }),
      providesTags: (_result, _error, hcpId) => [{ type: TAGS.PROFILE, id: hcpId }, TAGS.PROFILE],
    }),
    /** POST, but a read: the talking points for one participant × category (latest revision). */
    getCallPrep: build.query<CallPrep, CallPrepArgs>({
      query: (body) => ({ url: '/call-prep', method: 'POST', data: body }),
      providesTags: (_result, _error, args) => [{ type: TAGS.CALL_PREP, id: `${args.participant_id}|${args.category}` }, TAGS.CALL_PREP],
    }),
  }),
});

export const { useGetProfileQuery, useGetCallPrepQuery } = callPrepApi;
