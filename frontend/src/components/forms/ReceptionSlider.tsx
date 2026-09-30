import { useField } from 'formik';
import { memo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { LABELS } from '../../constants/labels';
import { useReference } from '../../hooks/useReference';
import type { Reception } from '../../types/models';
import { cx } from '../../utils/cx';
import { receptionFromX, stepReception } from '../../utils/reception';
import { receptionText } from '../../utils/reference';

interface ReceptionSliderProps {
  name: string;
  onChange?: (value: Reception) => void;
}

const KNOB = ['left-0 border-[#C2410C] opacity-100', 'left-1/2 border-[#D97706] opacity-100', 'left-full border-green opacity-100'];
const FILL = ['w-0', 'w-1/2 bg-[#F2B45C]', 'w-full bg-linear-90 from-[#F2B45C] to-greenb'];
const LABEL_ON = ['text-[#C2410C]', 'text-warn', 'text-green'];
const STOPS = ['left-0', 'left-1/2', 'left-full'];

/** 3-stop reception slider: drag, click a label or use the arrow keys. Starts unset. */
const ReceptionSlider = ({ name, onChange }: ReceptionSliderProps) => {
  const [field, , helpers] = useField<Reception | null>(name);
  const value = field.value ?? null;
  const dragging = useRef(false);
  const { receptionLabels } = useReference();

  const set = (next: Reception) => {
    if (next === value) return;
    void helpers.setValue(next);
    onChange?.(next);
  };
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    set(receptionFromX(event.clientX, rect.left, rect.width));
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    fromPointer(event);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') set(stepReception(value, 1));
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') set(stepReception(value, -1));
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={LABELS.postCall.sliderAria}
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={value ?? undefined}
      aria-valuetext={receptionText(receptionLabels, value, LABELS.postCall.notRated)}
      onKeyDown={onKeyDown}
      className="group px-0.5 pt-1 outline-none"
    >
      <div
        data-testid="reception-track"
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        className="relative mx-2.5 mb-2.5 mt-2 h-2 cursor-pointer touch-none rounded-full bg-line2 group-focus-visible:shadow-[0_0_0_3px_rgba(21,108,180,.25)]"
      >
        <i className={cx('absolute inset-y-0 left-0 rounded-full transition-all duration-200', value === null ? 'w-0' : FILL[value])} />
        {STOPS.map((pos) => (
          <span key={pos} className={cx('absolute top-1/2 -ml-1.5 -mt-1.5 size-3 rounded-full border-2 border-[#B9C7D6] bg-white', pos)} />
        ))}
        <span
          className={cx(
            'absolute top-1/2 -ml-[11px] -mt-[11px] size-[22px] rounded-full border-[3px] bg-white shadow-[0_2px_6px_rgba(16,40,80,.25)] transition-all duration-200',
            value === null ? 'left-1/2 border-[#9AA8B8] opacity-55' : KNOB[value],
          )}
        />
      </div>
      <div className="flex justify-between gap-1.5">
        {receptionLabels.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => set(index as Reception)}
            className={cx(
              'rounded-md px-1 py-0.5 text-xs font-semibold leading-tight hover:bg-bluet hover:text-blued',
              index === 1 && 'text-center',
              index === 2 && 'text-right',
              value === index ? LABEL_ON[index] : value === null ? 'text-[#51637A]' : 'text-ink3',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default memo(ReceptionSlider);
