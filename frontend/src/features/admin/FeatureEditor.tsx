import { Button, Switch } from '@mui/material';
import { memo, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import AppCard from '../../components/common/AppCard';
import AsyncContent from '../../components/common/AsyncContent';
import type { FeatureCode } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useGetBrandFeaturesQuery, useSaveBrandFeaturesMutation, useSaveBrandMutation } from '../../redux/api/adminApi';
import type { AdminFeature, BrandFeatures } from '../../types/models';
import type { ApiError } from '../../types/api';
import { cx } from '../../utils/cx';
import { formatLongDate } from '../../utils/format';

const A = LABELS.admin;

interface EditorProps {
  data: BrandFeatures;
}

type Draft = Record<FeatureCode, boolean>;

const toDraft = (features: AdminFeature[]): Draft => Object.fromEntries(features.map((f) => [f.code, f.is_enabled])) as Draft;

/** The switches for one brand. Edits are a draft until Save; a child shows when its parent is off. */
const Editor = ({ data }: EditorProps) => {
  const { brand, features } = data;
  const [draft, setDraft] = useState<Draft>(() => toDraft(features));
  const [active, setActive] = useState(brand.is_active);
  const [saveFeatures, { isLoading: savingFeatures }] = useSaveBrandFeaturesMutation();
  const [saveBrand, { isLoading: savingBrand }] = useSaveBrandMutation();
  const byCode = useMemo(() => Object.fromEntries(features.map((f) => [f.code, f])), [features]);
  const groups = useMemo(() => {
    const out: [string, AdminFeature[]][] = [];
    for (const f of features) {
      const last = out[out.length - 1];
      if (last && last[0] === f.group) last[1].push(f);
      else out.push([f.group, [f]]);
    }
    return out;
  }, [features]);
  const changed = features.filter((f) => draft[f.code] !== f.is_enabled);
  const dirty = changed.length + (active !== brand.is_active ? 1 : 0);
  const saving = savingFeatures || savingBrand;
  const setAll = (on: boolean) => setDraft(Object.fromEntries(features.map((f) => [f.code, on])) as Draft);
  const reset = () => {
    setDraft(toDraft(features));
    setActive(brand.is_active);
  };

  const save = async () => {
    try {
      if (active !== brand.is_active) {
        await saveBrand({ brand_code: brand.code, brand_name: brand.name, description: brand.description, is_active: active }).unwrap();
      }
      if (changed.length) {
        await saveFeatures({ code: brand.code, features: Object.fromEntries(changed.map((f) => [f.code, draft[f.code]])) }).unwrap();
      }
      toast.success(A.saved);
    } catch (e) {
      toast.error((e as ApiError).message || LABELS.app.genericError);
    }
  };

  return (
    <AppCard
      title={`${A.features} · ${brand.name}`}
      subtitle={A.enabled(features.filter((f) => draft[f.code]).length, features.length)}
      actions={
        <label className="flex items-center gap-1 text-[12.6px] font-semibold text-ink2" title={A.activeHint}>
          <Switch size="small" checked={active} onChange={(e) => setActive(e.target.checked)} slotProps={{ input: { 'aria-label': A.active } }} />
          {active ? A.active : A.inactive}
        </label>
      }
      bodyClassName="flex flex-col"
      testId="feature-editor"
    >
      <div className="flex gap-2 border-b border-line2 px-4 py-2">
        <Button size="small" onClick={() => setAll(true)}>
          {A.allOn}
        </Button>
        <Button size="small" onClick={() => setAll(false)}>
          {A.allOff}
        </Button>
      </div>
      <div className="flex flex-col gap-4 px-4 py-3">
        {groups.map(([group, items]) => (
          <section key={group}>
            <h3 className="m-0 mb-1.5 text-[12px] font-bold uppercase tracking-[.7px] text-navyd">{group}</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {items.map((f) => {
                const parent = f.requires ? byCode[f.requires] : undefined;
                const blocked = parent !== undefined && !draft[parent.code];
                return (
                  <li key={f.code} className={cx('flex items-start gap-2.5 rounded-lg px-2 py-1.5', draft[f.code] !== f.is_enabled && 'bg-warnbg')}>
                    <Switch
                      size="small"
                      checked={draft[f.code]}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.code]: e.target.checked }))}
                      slotProps={{ input: { 'aria-label': f.name } }}
                    />
                    <span className="min-w-0 flex-1">
                      <b className={cx('block text-[13.6px] font-semibold', blocked ? 'text-ink3' : 'text-ink')}>
                        {f.name}
                        {blocked && parent && (
                          <span className="ml-2 rounded-md border border-warnbd bg-warnbg px-1.5 py-px text-[11px] font-semibold text-warndk">{A.needs(parent.name)}</span>
                        )}
                      </b>
                      <span className="block text-[12.4px] font-medium leading-[1.4] text-ink3">{f.description}</span>
                      {f.updated_by && f.updated_at && (
                        <span className="block text-[11.4px] font-medium text-[#7A8796]">{A.lastChange(f.updated_by, formatLongDate(f.updated_at))}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <footer className="sticky bottom-0 flex items-center gap-2.5 border-t border-line2 bg-white px-4 py-2.5">
        <span className="flex-1 text-[12.6px] font-semibold text-warndk" aria-live="polite">
          {dirty ? A.unsaved(dirty) : ''}
        </span>
        <Button onClick={reset} disabled={!dirty || saving}>
          {A.reset}
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? A.saving : A.save}
        </Button>
      </footer>
    </AppCard>
  );
};

interface FeatureEditorProps {
  brandCode: string;
}

/**
 * Loads one brand's features; the editor remounts with fresh state after every save.
 * currentData, not data: while another brand loads, the previous brand's switches must not show.
 */
const FeatureEditor = ({ brandCode }: FeatureEditorProps) => {
  const { currentData: data, error, isFetching, refetch, fulfilledTimeStamp } = useGetBrandFeaturesQuery(brandCode);
  return (
    <AsyncContent isLoading={isFetching && !data} error={error} onRetry={() => void refetch()} isEmpty={!data}>
      {data && <Editor key={`${brandCode}|${fulfilledTimeStamp}`} data={data} />}
    </AsyncContent>
  );
};

export default memo(FeatureEditor);
