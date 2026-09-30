import { useEffect, useMemo } from 'react';
import { useGetProfileQuery } from '../redux/api/callPrepApi';
import { participantsInitialised } from '../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import type { Profile } from '../types/models';
import { orderParticipants } from '../utils/callPrep';

/** Primary first, then the preselected NP/PA, in profile order. */
export const initialParticipantIds = (profile: Profile): string[] => {
  const ids = new Set([profile.primary_hcp_id, ...profile.preselected_participant_ids]);
  return profile.participants.map((p) => p.hcp_id).filter((id) => ids.has(id));
};

/** The selected target's profile and the meeting participants chosen for the call (shared by Tab 2 and Tab 3). */
export const useCallParticipants = (hcpId: string) => {
  const dispatch = useAppDispatch();
  const query = useGetProfileQuery(hcpId);
  const profile = query.data;
  const participantIds = useAppSelector((s) => s.callSession.participantIds);
  const participantsFor = useAppSelector((s) => s.callSession.participantsFor);

  // Sync: the first time a profile loads for this target, preselect its participants.
  useEffect(() => {
    if (profile && participantsFor !== hcpId) dispatch(participantsInitialised({ hcpId, ids: initialParticipantIds(profile) }));
  }, [dispatch, hcpId, participantsFor, profile]);

  const primary = profile?.participants.find((p) => p.hcp_id === profile.primary_hcp_id);
  const selected = useMemo(() => {
    if (!profile) return [];
    const ordered = orderParticipants(profile.participants, participantIds);
    return ordered.length ? ordered : primary ? [primary] : [];
  }, [profile, participantIds, primary]);

  return {
    profile,
    primary,
    selected,
    participantIds,
    ready: Boolean(profile && participantsFor === hcpId),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
