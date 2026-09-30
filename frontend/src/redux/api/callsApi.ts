import type {
  AssessmentInput,
  Call,
  ComplianceCheckArgs,
  ComplianceResult,
  EnsureCallArgs,
  NextCallResult,
} from '../../types/models';
import { TAGS, baseApi } from './baseApi';

export const callsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * POST /calls is idempotent for an open planned call (it returns it and
     * updates its participants), so it is modelled as a query: Tab 3 opens the
     * call by rendering, and a participant change simply re-issues it.
     */
    ensureCall: build.query<Call, EnsureCallArgs>({
      query: (body) => ({ url: '/calls', method: 'POST', data: body }),
      providesTags: (result) => (result ? [{ type: TAGS.CALL, id: result.call_id }, TAGS.CALL] : [TAGS.CALL]),
    }),
    getCall: build.query<Call, string>({
      query: (callId) => ({ url: `/calls/${encodeURIComponent(callId)}` }),
      providesTags: (_r, _e, callId) => [{ type: TAGS.CALL, id: callId }],
    }),
    getActiveCall: build.query<Call | null, string>({
      query: (hcpId) => ({ url: '/calls/active', params: { hcp_id: hcpId } }),
      providesTags: [TAGS.CALL],
    }),
    saveAssessments: build.mutation<Call, { callId: string; items: AssessmentInput[] }>({
      query: ({ callId, items }) => ({ url: `/calls/${encodeURIComponent(callId)}/assessments`, method: 'PUT', data: { items } }),
      // Only the call itself changes on an autosave (talking points and the profile change on
      // next-call). The form keeps its own values keyed by call id, so a refetch never clobbers typing.
      invalidatesTags: (_r, _e, { callId }) => [{ type: TAGS.CALL, id: callId }],
    }),
    checkCompliance: build.mutation<ComplianceResult, ComplianceCheckArgs>({
      query: (body) => ({ url: '/compliance/check', method: 'POST', data: body }),
    }),
    acceptSuggestion: build.mutation<unknown, string>({
      query: (checkId) => ({ url: `/compliance/${encodeURIComponent(checkId)}/accept`, method: 'POST' }),
    }),
    generateNextCall: build.mutation<NextCallResult, string>({
      query: (callId) => ({ url: `/calls/${encodeURIComponent(callId)}/next-call`, method: 'POST' }),
      invalidatesTags: [TAGS.CALL, TAGS.CALL_PREP, TAGS.PROFILE, TAGS.TARGETS, TAGS.ACCOUNTS],
    }),
  }),
});

export const {
  useEnsureCallQuery,
  useGetCallQuery,
  useGetActiveCallQuery,
  useSaveAssessmentsMutation,
  useCheckComplianceMutation,
  useAcceptSuggestionMutation,
  useGenerateNextCallMutation,
} = callsApi;
