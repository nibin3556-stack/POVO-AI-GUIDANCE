import { memo, type MouseEvent } from 'react';
import { Cell, Label, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { CHART_COLORS, COLORS } from '../../constants/colors';

export interface DonutSlice {
  key: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  total: number;
  centerLabel: string;
  activeIndex?: number | null;
  onHover?: (index: number, clientX: number, clientY: number) => void;
  ariaLabel: string;
}

interface CentreProps {
  viewBox?: unknown;
  total: number;
  label: string;
}

const CentreLabel = ({ viewBox, total, label }: CentreProps) => {
  const box = (viewBox ?? {}) as { cx?: number; cy?: number };
  const cx = box.cx ?? 0;
  const cy = box.cy ?? 0;
  return (
    <g>
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={28} fontWeight={700} fill={COLORS.ink}>
        {total}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={COLORS.ink3}>
        {label}
      </text>
    </g>
  );
};

/** Donut with the total in the centre (Target Segmentation). Animates in. */
const DonutChart = ({ slices, total, centerLabel, activeIndex = null, onHover, ariaLabel }: DonutChartProps) => {
  return (
    <div role="img" aria-label={ariaLabel} className="size-full min-h-[120px]">
      <ResponsiveContainer width="100%" height="100%" minHeight={120}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="key"
            innerRadius="66%"
            outerRadius="98%"
            paddingAngle={1}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive
            animationDuration={1100}
          >
            {slices.map((slice, index) => (
              <Cell
                key={slice.key}
                fill={slice.color}
                className="cursor-pointer"
                style={{ filter: activeIndex === index ? 'brightness(1.1)' : undefined }}
                onMouseMove={(e: MouseEvent<SVGElement>) => onHover?.(index, e.clientX, e.clientY)}
              />
            ))}
            <Label position="center" content={(props) => <CentreLabel viewBox={props.viewBox} total={total} label={centerLabel} />} />
          </Pie>
          {slices.length === 0 && <Pie data={[{ value: 1 }]} dataKey="value" fill={CHART_COLORS.track} innerRadius="66%" outerRadius="98%" />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default memo(DonutChart);
