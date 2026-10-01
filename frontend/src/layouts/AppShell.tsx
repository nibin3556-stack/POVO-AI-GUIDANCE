import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Outlet, useLocation } from 'react-router';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ErrorState from '../components/common/ErrorState';
import Loader from '../components/common/Loader';
import { FORBIDDEN_EVENT, PERMISSIONS } from '../constants/constant';
import { LABELS } from '../constants/labels';
import ImpersonateDialog from '../features/impersonation/ImpersonateDialog';
import { useImpersonation } from '../features/impersonation/useImpersonation';
import { useGetMeQuery, useGetReferenceQuery } from '../redux/api/sessionApi';
import { selectSelectedHcpId } from '../redux/callSession/callSessionSelectors';
import { useAppSelector } from '../redux/hooks';
import type { ApiError } from '../types/api';
import Header from './Header';
import ImpersonationBar from './ImpersonationBar';
import TabBar from './TabBar';

const accessMessage = (error: unknown): string => {
  const e = error as ApiError;
  if (e?.status === 403) return e.message || LABELS.app.notSetUp;
  return e?.message || LABELS.app.genericError;
};

/** The shell: header, impersonation bar, tabs and the scrolling page area. */
const AppShell = () => {
  const { data: me, error: meError, isLoading: meLoading, refetch: refetchMe } = useGetMeQuery();
  // Pages label and colour data from the reference lookups, so they wait for both.
  const { data: reference, error: refError, isLoading: refLoading, refetch: refetchRef } = useGetReferenceQuery();
  const error = meError ?? refError;
  const isLoading = meLoading || refLoading;
  const selectedHcpId = useAppSelector(selectSelectedHcpId);
  const { start, exit, isStarting, isExiting } = useImpersonation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const location = useLocation();
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onForbidden = (event: Event) => {
      const detail = (event as CustomEvent<ApiError>).detail;
      toast.error(detail?.message || LABELS.app.forbidden, { id: 'forbidden' });
    };
    window.addEventListener(FORBIDDEN_EVENT, onForbidden);
    return () => window.removeEventListener(FORBIDDEN_EVENT, onForbidden);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [location.pathname]);

  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const handleViewAs = useCallback(
    async (employeeId: string): Promise<string | null> => {
      const message = await start(employeeId);
      if (!message) setDialogOpen(false);
      return message;
    },
    [start],
  );
  const handleExit = useCallback(() => void exit(), [exit]);

  if (isLoading) return <Loader fill className="h-full" />;
  const refetch = () => {
    void refetchMe();
    void refetchRef();
  };

  if (error || !me || !reference) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ErrorState message={accessMessage(error)} onRetry={refetch} className="max-w-[560px]" />
      </div>
    );
  }

  const canImpersonate = me.permissions.includes(PERMISSIONS.IMPERSONATE);
  return (
    <div className="flex h-full flex-col">
      <Header me={me} canImpersonate={canImpersonate} onImpersonate={openDialog} onExit={handleExit} />
      {me.is_impersonating && <ImpersonationBar me={me} onExit={handleExit} exiting={isExiting} />}
      <TabBar selectedHcpId={selectedHcpId} />
      <main ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-3.5 pt-2.5 max-bp760:px-3">
        <div className="mx-auto flex min-h-full max-w-[1860px] flex-col">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<Loader fill />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      {canImpersonate && <ImpersonateDialog open={dialogOpen} ownerId={me.signed_in.employee_id} onClose={closeDialog} onViewAs={handleViewAs} busy={isStarting} />}
    </div>
  );
};

export default AppShell;
