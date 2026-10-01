import { Dialog } from '@mui/material';
import { Form, Formik, useFormikContext } from 'formik';
import { memo, useCallback, useMemo, useState } from 'react';
import ErrorState from '../../components/common/ErrorState';
import Icon from '../../components/common/Icon';
import Loader from '../../components/common/Loader';
import FormInput from '../../components/forms/FormInput';
import { EMPLOYEE_SEARCH_MIN_CHARS, SEARCH_DEBOUNCE_MS, TIMING } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useLazySearchEmployeesQuery, useSearchEmployeesQuery } from '../../redux/api/sessionApi';
import { impersonationLookupSchema, lookupInitialValues, type LookupValues } from '../../schemas/impersonationSchema';
import type { Employee } from '../../types/models';
import { delay } from '../../utils/format';
import { readRecentEmployees } from '../../utils/recentEmployees';
import EmployeeSuggestionList from './EmployeeSuggestionList';

interface ImpersonateDialogProps {
  open: boolean;
  /** The signed-in employee: keys the recent list in this browser. */
  ownerId: string;
  onClose: () => void;
  /** Starts viewing as the employee; resolves to null on success or the message to show. */
  onViewAs: (employeeId: string) => Promise<string | null>;
  busy: boolean;
}

type Status = { kind: 'idle' } | { kind: 'loading'; q: string } | { kind: 'notFound'; q: string } | { kind: 'failed'; message: string };

const L = LABELS.impersonate;

const LookupRow = ({ busy }: { busy: boolean }) => {
  const { values, isSubmitting } = useFormikContext<LookupValues>();
  return (
    <div className="flex flex-wrap gap-[9px]">
      <div className="min-w-0 flex-[1_1_220px]">
        <FormInput name="q" placeholder={L.placeholder} ariaLabel={L.inputLabel} autoFocus />
      </div>
      <button
        type="submit"
        disabled={!values.q.trim() || isSubmitting || busy}
        className="inline-flex h-10 items-center gap-1.5 rounded-[9px] border-[1.5px] border-blue bg-white px-4 text-sm font-semibold text-blued hover:bg-bluet disabled:cursor-not-allowed disabled:border-line disabled:text-[#8A97A8]"
      >
        <Icon name="person_search" className="text-[19px]" />
        {L.lookUp}
      </button>
    </div>
  );
};

/** Before 2 characters: the reps recently viewed as in this browser (nothing when there are none). */
const RecentList = ({ recent, onPick }: { recent: Employee[]; onPick: (e: Employee) => void }) => {
  if (!recent.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.4px] font-bold uppercase tracking-[.5px] text-ink3">{L.recent}</span>
      <EmployeeSuggestionList employees={recent} query="" onPick={onPick} />
    </div>
  );
};

interface ResultsProps {
  status: Status;
  recent: Employee[];
  busy: boolean;
  onPick: (e: Employee) => void;
}

const LookupResults = ({ status, recent, busy, onPick }: ResultsProps) => {
  const { values } = useFormikContext<LookupValues>();
  const q = values.q.trim();
  const debounced = useDebouncedValue(q, SEARCH_DEBOUNCE_MS);
  const search = useSearchEmployeesQuery(debounced, { skip: debounced.length < EMPLOYEE_SEARCH_MIN_CHARS });

  if (busy || (status.kind === 'loading' && status.q === q)) return <Loader label={L.lookingUp} className="justify-start" />;
  if (status.kind === 'failed') return <ErrorState message={status.message} />;
  if (status.kind === 'notFound' && status.q === q) return <ErrorState message={L.notFound(q)} />;
  if (q.length < EMPLOYEE_SEARCH_MIN_CHARS) return <RecentList recent={recent} onPick={onPick} />;
  if (debounced !== q || search.isFetching) return <Loader label={L.lookingUp} className="justify-start" />;
  if (search.error) return <ErrorState message={(search.error as { message?: string }).message} onRetry={() => void search.refetch()} />;
  if (!search.data?.length) return <ErrorState message={L.notFound(q)} />;
  return <EmployeeSuggestionList employees={search.data} query={q} onPick={onPick} />;
};

/** Look up a rep by name, Employee ID, Network ID or territory; picking one switches straight to their view. */
const ImpersonateDialog = ({ open, ownerId, onClose, onViewAs, busy }: ImpersonateDialogProps) => {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [lookup] = useLazySearchEmployeesQuery();
  // Re-read whenever the dialog opens, so a rep viewed a moment ago is listed.
  const recent = useMemo(() => (open ? readRecentEmployees(ownerId) : []), [open, ownerId]);

  const viewAs = useCallback(
    async (employee: Employee) => {
      const message = await onViewAs(employee.employee_id);
      setStatus(message ? { kind: 'failed', message } : { kind: 'idle' });
    },
    [onViewAs],
  );

  const handleSubmit = useCallback(
    async ({ q }: LookupValues) => {
      const query = q.trim();
      setStatus({ kind: 'loading', q: query });
      try {
        const [found] = await Promise.all([lookup(query, true).unwrap(), delay(TIMING.LOOKUP_MIN_MS)]);
        if (found.length === 1 && found[0]) await viewAs(found[0]);
        else setStatus(found.length ? { kind: 'idle' } : { kind: 'notFound', q: query });
      } catch {
        setStatus({ kind: 'notFound', q: query });
      }
    },
    [lookup, viewAs],
  );

  const handleClose = useCallback(() => {
    setStatus({ kind: 'idle' });
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { width: 'min(600px, 94vw)' } } }} aria-labelledby="impersonate-title">
      <div className="flex items-center justify-between bg-blued px-[18px] py-[13px] text-white">
        <b id="impersonate-title" className="text-[15.5px] font-bold">
          {L.title}
        </b>
        <button type="button" onClick={handleClose} aria-label={L.close} className="flex rounded-md p-0.5 text-white hover:bg-white/15">
          <Icon name="close" />
        </button>
      </div>
      <Formik initialValues={lookupInitialValues} validationSchema={impersonationLookupSchema} onSubmit={handleSubmit} validateOnBlur={false}>
        <Form className="flex flex-col gap-3 px-[18px] pb-[18px] pt-4" noValidate>
          <p className="m-0 text-[13.6px] font-medium leading-normal text-ink2">{L.intro}</p>
          <LookupRow busy={busy} />
          <LookupResults status={status} recent={recent} busy={busy} onPick={(e) => void viewAs(e)} />
        </Form>
      </Formik>
    </Dialog>
  );
};

export default memo(ImpersonateDialog);
