import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { ROUTES } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useEndImpersonationMutation, useStartImpersonationMutation } from '../../redux/api/sessionApi';
import { useAppDispatch } from '../../redux/hooks';
import { impersonationEnded, impersonationStarted } from '../../redux/session/sessionSlice';
import type { ApiError } from '../../types/api';

/** Start / exit impersonation: audited server-side, then the whole cache and call session reset (store listener). */
export const useImpersonation = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [startRequest, startState] = useStartImpersonationMutation();
  const [endRequest, endState] = useEndImpersonationMutation();

  const start = useCallback(
    async (employeeId: string): Promise<boolean> => {
      try {
        const employee = await startRequest(employeeId).unwrap();
        dispatch(impersonationStarted({ employeeId: employee.employee_id, name: employee.full_name }));
        navigate(ROUTES.PERFORMANCE);
        toast.success(LABELS.impersonate.started(employee.full_name));
        return true;
      } catch (error) {
        toast.error((error as ApiError).message ?? LABELS.app.genericError);
        return false;
      }
    },
    [dispatch, navigate, startRequest],
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
    toast.success(LABELS.impersonate.ended);
  }, [dispatch, endRequest, navigate]);

  return { start, exit, isStarting: startState.isLoading, isExiting: endState.isLoading };
};
