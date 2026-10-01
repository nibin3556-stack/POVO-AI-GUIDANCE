import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ROUTES } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useEndImpersonationMutation, useGetMeQuery, useStartImpersonationMutation } from '../../redux/api/sessionApi';
import { useAppDispatch } from '../../redux/hooks';
import { impersonationEnded, impersonationStarted } from '../../redux/session/sessionSlice';
import type { ApiError } from '../../types/api';
import { rememberRecentEmployee } from '../../utils/recentEmployees';

/**
 * Start / exit impersonation: audited server-side, then the whole cache and call session reset (store listener).
 * No toasts: the header and the impersonation bar already show who is being viewed.
 * `start` resolves to null on success, or the message to show in the dialog.
 */
export const useImpersonation = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: me } = useGetMeQuery();
  const [startRequest, startState] = useStartImpersonationMutation();
  const [endRequest, endState] = useEndImpersonationMutation();
  const ownerId = me?.signed_in.employee_id;

  const start = useCallback(
    async (employeeId: string): Promise<string | null> => {
      try {
        const employee = await startRequest(employeeId).unwrap();
        if (ownerId) rememberRecentEmployee(ownerId, employee);
        dispatch(impersonationStarted({ employeeId: employee.employee_id, name: employee.full_name }));
        navigate(ROUTES.PERFORMANCE);
        return null;
      } catch (error) {
        return (error as ApiError).message ?? LABELS.app.genericError;
      }
    },
    [dispatch, navigate, ownerId, startRequest],
  );

  const exit = useCallback(async () => {
    try {
      // Sent while the header is still attached, so the backend audits the right session.
      await endRequest().unwrap();
    } catch {
      /* The exit is still honoured locally: the header simply stops being sent. */
    }
    dispatch(impersonationEnded());
    navigate(ROUTES.PERFORMANCE);
  }, [dispatch, endRequest, navigate]);

  return { start, exit, isStarting: startState.isLoading, isExiting: endState.isLoading };
};
