import { Dialog } from '@mui/material';
import { Form, Formik, useFormikContext } from 'formik';
import { memo, useCallback, useState } from 'react';
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
import EmployeeResultCard from './EmployeeResultCard';
import EmployeeSuggestionList from './EmployeeSuggestionList';

interface ImpersonateDialogProps {
  open: boolean;
  onClose: () => void;
  onViewAs: (employeeId: string) => void;
  busy: boolean;
}

type LookupStatus = { kind: 'idle' } | { kind: 'loading'; q: string } | { kind: 'notFound'; q: string } | { kind: 'hit'; q: string; employee: Employee };

const L = LABELS.impersonate;

const LookupRow = () => {
  const { values, isSubmitting } = useFormikContext<LookupValues>();
  return (
    <div className="flex flex-wrap gap-[9px]">
      <div className="min-w-0 flex-[1_1_220px]">
        <FormInput name="q" placeholder={L.placeholder} ariaLabel={L.inputLabel} autoFocus />
      </div>
      <button
        type="submit"
        disabled={!values.q.trim() || isSubmitting}
        className="inline-flex h-10 items-center gap-1.5 rounded-[9px] border-[1.5px] border-blue bg-white px-4 text-sm font-semibold text-blued hover:bg-bluet disabled:cursor-not-allowed disabled:border-line disabled:text-[#8A97A8]"
      >
        <Icon name="person_search" className="text-[19px]" />
        {L.lookUp}
      </button>
    </div>
  );
};

const LookupResults = ({ status, onPick, onViewAs, busy }: { status: LookupStatus; onPick: (e: Employee) => void; onViewAs: (id: string) => void; busy: boolean }) => {
  const { values } = useFormikContext<LookupValues>();
  const q = values.q.trim();
  const debounced = useDebouncedValue(q, SEARCH_DEBOUNCE_MS);
  const current = 'q' in status && status.q === q ? status : null;
  const search = useSearchEmployeesQuery(debounced, { skip: debounced.length < EMPLOYEE_SEARCH_MIN_CHARS || Boolean(current) });

  if (current?.kind === 'loading') return <Loader label={L.lookingUp} className="justify-start" />;
  if (current?.kind === 'notFound') return <ErrorState message={L.notFound(current.q)} />;
  if (current?.kind === 'hit') return <EmployeeResultCard employee={current.employee} onViewAs={() => onViewAs(current.employee.employee_id)} busy={busy} />;
  if (q.length < EMPLOYEE_SEARCH_MIN_CHARS || debounced !== q) return null;
  if (search.isFetching) return <Loader label={L.lookingUp} className="justify-start" />;
  if (search.error) return <ErrorState message={(search.error as { message?: string }).message} onRetry={() => void search.refetch()} />;
  if (!search.data?.length) return <ErrorState message={L.notFound(q)} />;
  return <EmployeeSuggestionList employees={search.data} query={q} onPick={onPick} />;
};

/** Manager-only dialog: look up a rep by name, Employee ID or Network ID, then view the app as them. */
const ImpersonateDialog = ({ open, onClose, onViewAs, busy }: ImpersonateDialogProps) => {
  const [status, setStatus] = useState<LookupStatus>({ kind: 'idle' });
  const [lookup] = useLazySearchEmployeesQuery();

  const handleSubmit = useCallback(
    async ({ q }: LookupValues) => {
      const query = q.trim();
      setStatus({ kind: 'loading', q: query });
      try {
        const [found] = await Promise.all([lookup(query, true).unwrap(), delay(TIMING.LOOKUP_MIN_MS)]);
        if (!found.length) setStatus({ kind: 'notFound', q: query });
        else if (found.length === 1 && found[0]) setStatus({ kind: 'hit', q: query, employee: found[0] });
        else setStatus({ kind: 'idle' });
      } catch {
        setStatus({ kind: 'notFound', q: query });
      }
    },
    [lookup],
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { width: 'min(600px, 94vw)' } } }} aria-labelledby="impersonate-title">
      <div className="flex items-center justify-between bg-blued px-[18px] py-[13px] text-white">
        <b id="impersonate-title" className="text-[15.5px] font-bold">
          {L.title}
        </b>
        <button type="button" onClick={onClose} aria-label={L.close} className="flex rounded-md p-0.5 text-white hover:bg-white/15">
          <Icon name="close" />
        </button>
      </div>
      <Formik initialValues={lookupInitialValues} validationSchema={impersonationLookupSchema} onSubmit={handleSubmit} validateOnBlur={false}>
        <Form className="flex flex-col gap-3 px-[18px] pb-[18px] pt-4" noValidate>
          <p className="m-0 text-[13.6px] font-medium leading-normal text-ink2">{L.intro}</p>
          <LookupRow />
          <PickAware status={status} setStatus={setStatus} onViewAs={onViewAs} busy={busy} />
        </Form>
      </Formik>
    </Dialog>
  );
};

/** Picking a suggestion shows its result card for the query that is in the box. */
const PickAware = ({
  status,
  setStatus,
  onViewAs,
  busy,
}: {
  status: LookupStatus;
  setStatus: (s: LookupStatus) => void;
  onViewAs: (id: string) => void;
  busy: boolean;
}) => {
  const { values } = useFormikContext<LookupValues>();
  const onPick = (employee: Employee) => setStatus({ kind: 'hit', q: values.q.trim(), employee });
  return <LookupResults status={status} onPick={onPick} onViewAs={onViewAs} busy={busy} />;
};

export default memo(ImpersonateDialog);
