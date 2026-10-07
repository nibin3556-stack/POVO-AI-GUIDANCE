import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import AppButton from '../../components/common/AppButton';
import AppCard from '../../components/common/AppCard';
import AsyncContent from '../../components/common/AsyncContent';
import Icon from '../../components/common/Icon';
import ToggleSwitch from '../../components/common/ToggleSwitch';
import { TIMING, type FeatureCode } from '../../constants/constant';
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

/** The state before one change, and what that change was ("Turn all on"), for undo. */
interface Snapshot {
  label: string;
  draft: Draft;
  active: boolean;
}

const UNDO_LIMIT = 30;

const toDraft =(features: AdminFeature[]): Draft => Object.fromEntries(features.map((f) => [f.code, f.is_enabled])) as Draft;

/**
 * The switches for one brand, autosaved: 800ms after the last change, PUT only
 * the switches that differ from the server. A child shows when its parent is off.
 */
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
  const changed = useMemo(() => features.filter((f) => draft[f.code] !== f.is_enabled), [features, draft]);
  const brandChanged = active !== brand.is_active;
  const pending = changed.length > 0 || brandChanged;
  const saving = savingFeatures || savingBrand;
  const [history, setHistory] = useState<Snapshot[]>([]);
  const prev = history[history.length - 1];

  /** Every change goes through here so it can be undone; a click that changes nothing is not recorded. */
  const apply = (label: string, next: Partial<Omit<Snapshot, 'label'>>) => {
    const nextDraft = next.draft ?? draft;
    const nextActive = next.active ?? active;
    if (nextActive === active && features.every((f) => nextDraft[f.code] === draft[f.code])) return;
    setHistory((h) => [...h.slice(-(UNDO_LIMIT - 1)), { label, draft, active }]);
    setDraft(nextDraft);
    setActive(nextActive);
  };
  const undo = useCallback(() => {
    if (!prev) return;
    setDraft(prev.draft);
    setActive(prev.active);
    setHistory((h) => h.slice(0, -1));
  }, [prev]);
  const setAll = (on: boolean) => apply(on ? A.allOn : A.allOff, { draft: Object.fromEntries(features.map((f) => [f.code, on])) as Draft });

  // Ctrl+Z / Cmd+Z undoes too, unless the cursor is in a text field (the add brand form has its own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(async () => {
      try {
        if (brandChanged) {
          await saveBrand({ brand_code: brand.code, brand_name: brand.name, description: brand.description, is_active: active }).unwrap();
        }
        if (changed.length) {
          await saveFeatures({ code: brand.code, features: Object.fromEntries(changed.map((f) => [f.code, draft[f.code]])) }).unwrap();
        }
      } catch (e) {
        // Back to what the server has, so the switches never show a state that was not saved.
        setDraft(toDraft(features));
        setActive(brand.is_active);
        setHistory([]);
        toast.error((e as ApiError).message || A.saveFailed, { id: 'admin-autosave-failed' });
      }
    }, TIMING.AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pending, brandChanged, changed, draft, active, brand, features, saveBrand, saveFeatures]);

  const status = pending || saving ? A.saving : A.allSaved;

  return (
    <AppCard
      title={`${A.features} · ${brand.name}`}
      subtitle={A.enabled(features.filter((f) => draft[f.code]).length, features.length)}
      actions={
        <>
          <span className="flex items-center gap-1 text-[12.4px] font-semibold text-ink3" aria-live="polite">
            <Icon name={pending || saving ? 'sync' : 'cloud_done'} className="text-[16px]" />
            {status}
          </span>
          <label className="flex cursor-pointer items-center gap-2 text-[12.6px] font-semibold text-ink2" title={A.activeHint}>
            <ToggleSwitch checked={active} onChange={(on) => apply(on ? A.brandOn : A.brandOff, { active: on })} label={A.active} />
            {active ? A.active : A.inactive}
          </label>
        </>
      }
      bodyClassName="flex flex-col"
      testId="feature-editor"
    >
      <div className="flex gap-2 border-b border-line2 px-4 py-2.5">
        <AppButton size="sm" icon="toggle_on" onClick={() => setAll(true)}>
          {A.allOn}
        </AppButton>
        <AppButton size="sm" icon="toggle_off" onClick={() => setAll(false)}>
          {A.allOff}
        </AppButton>
        <span className="flex-1" />
        {prev && (
          <span className="flex min-w-0 items-center truncate text-[12.2px] font-medium text-ink3" aria-live="polite">
            {A.lastAction(prev.label)}
          </span>
        )}
        <AppButton size="sm" icon="undo" onClick={undo} disabled={!prev} title={prev ? A.undoHint(prev.label) : undefined}>
          {A.undo}
        </AppButton>
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
                  <li key={f.code} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-soft">
                    <span className="pt-0.5">
                      <ToggleSwitch checked={draft[f.code]} onChange={(on) => apply(on ? A.turnedOn(f.name) : A.turnedOff(f.name), { draft: { ...draft, [f.code]: on } })} label={f.name} />
                    </span>
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
    </AppCard>
  );
};

interface FeatureEditorProps {
  brandCode: string;
}

/**
 * Loads one brand's features. The editor keeps its switches across the refetch
 * that follows each autosave, so a change made while a save is in flight is kept.
 * currentData, not data: while another brand loads, the previous brand's switches must not show.
 */
const FeatureEditor = ({ brandCode }: FeatureEditorProps) => {
  const { currentData: data, error, isFetching, refetch } = useGetBrandFeaturesQuery(brandCode);
  return (
    <AsyncContent isLoading={isFetching && !data} error={error} onRetry={() => void refetch()} isEmpty={!data}>
      {data && <Editor key={brandCode} data={data} />}
    </AsyncContent>
  );
};

export default memo(FeatureEditor);
