import { useState } from 'react';
import { Link } from 'react-router';
import AppCard from '../components/common/AppCard';
import AsyncContent from '../components/common/AsyncContent';
import EmptyState from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import Icon from '../components/common/Icon';
import Loader from '../components/common/Loader';
import { LABELS } from '../constants/labels';
import AddBrandForm from '../features/admin/AddBrandForm';
import BrandList from '../features/admin/BrandList';
import FeatureEditor from '../features/admin/FeatureEditor';
import { useGetAdminBrandsQuery, useGetAdminMeQuery } from '../redux/api/adminApi';

const A = LABELS.admin;

/**
 * Brand feature configuration, for the users in the backend's admin users
 * file. It sits outside the app shell: an admin does not need to be an
 * employee of the brand they configure.
 */
const AdminPage = () => {
  const { data: who, isLoading: whoLoading, error: whoError, refetch: refetchWho } = useGetAdminMeQuery();
  const isAdmin = Boolean(who?.is_admin);
  const brands = useGetAdminBrandsQuery(undefined, { skip: !isAdmin });
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? brands.data?.[0]?.code ?? null;

  let body;
  if (whoLoading) body = <Loader fill />;
  else if (whoError) body = <ErrorState message={(whoError as { message?: string }).message} onRetry={() => void refetchWho()} className="mx-auto mt-10 max-w-[560px]" />;
  else if (!isAdmin) body = <ErrorState message={A.notAdmin} className="mx-auto mt-10 max-w-[560px]" />;
  else
    body = (
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[320px_minmax(0,1fr)] items-start gap-4 max-bp900:grid-cols-1">
        <AppCard title={A.brands} tone="grey" bodyClassName="flex flex-col gap-3 p-3">
          <AsyncContent isLoading={brands.isLoading} error={brands.error} onRetry={() => void brands.refetch()} isEmpty={!brands.data?.length}>
            <BrandList brands={brands.data ?? []} selected={selected} onSelect={setPicked} />
          </AsyncContent>
          <AddBrandForm onAdded={setPicked} />
        </AppCard>
        {selected ? <FeatureEditor brandCode={selected} /> : <EmptyState message={A.selectBrand} variant="hint" />}
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[46px] flex-none items-center gap-3.5 bg-header px-5">
        <b className="text-base font-semibold tracking-[-.2px] text-white">{A.title}</b>
        <span className="flex-1" />
        <Link to="/" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-white no-underline hover:bg-white/10">
          <Icon name="arrow_back" className="text-lg" />
          {A.back}
        </Link>
      </header>
      <main className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4 max-bp760:px-3">{body}</main>
    </div>
  );
};

export default AdminPage;
