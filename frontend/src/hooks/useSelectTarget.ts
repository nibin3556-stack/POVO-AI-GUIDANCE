import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { preCallPath } from '../constants/constant';
import { targetSelected } from '../redux/callSession/callSessionSlice';
import { useAppDispatch } from '../redux/hooks';

/** Selecting a target opens Tab 2 on it and scrolls to the call prep. */
export const useSelectTarget = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  return useCallback(
    (hcpId: string) => {
      dispatch(targetSelected({ hcpId, scroll: true }));
      navigate(preCallPath(hcpId));
    },
    [dispatch, navigate],
  );
};
