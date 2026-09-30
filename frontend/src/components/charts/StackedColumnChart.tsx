import { memo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { CHART_COLORS, COLORS } from '../../constants/colors';

export interface ColumnDatum {
  label: string;
  primary: number;
  secondary: number;
  partial: boolean;
}

interface StackedColumnChartProps {
  data: ColumnDatum[];
  primaryColor?: string;
  secondaryColor?: string;
  xAxisLabel: string;
  yAxisLabel: string;
  partialLabel: string;
  onHover?: (index: number, clientX: number, clientY: number) => void;
  ariaLabel: string;
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string; index: number };
  lastIndex: number;
  partial: boolean;
  partialLabel: string;
  dense: boolean;
}

/** Month / week tick: the last (current) bucket in blue, with "to date" under a partial bar. */
const XTick = ({ x = 0, y = 0, payload, lastIndex, partial, partialLabel, dense }: TickProps) => {
  const isLast = payload?.index === lastIndex;
  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      <text y={14} textAnchor="middle" fontSize={dense ? 12 : 14} fontWeight={isLast ? 900 : 800} fill={isLast ? COLORS.blue : COLORS.ink3}>
        {payload?.value}
      </text>
      {isLast && partial && (
        <text y={29} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={COLORS.blue}>
          {partialLabel}
        </text>
      )}
    </g>
  );
};

const MIN_INSIDE_LABEL = 16;

const segmentLabel = (props: unknown) => {
  const { x = 0, y = 0, width = 0, height = 0, value } = props as { x?: number; y?: number; width?: number; height?: number; value?: number };
  if (!value || Number(height) < MIN_INSIDE_LABEL) return null;
  return (
    <text x={Number(x) + Number(width) / 2} y={Number(y) + Number(height) / 2 + 5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#fff">
      {value}
    </text>
  );
};

/** Stacked columns (JAK bottom, non-JAK top); the last, partial bar at 60% opacity labelled "to date". */
const StackedColumnChart = ({
  data,
  primaryColor = CHART_COLORS.jak,
  secondaryColor = CHART_COLORS.nonJak,
  xAxisLabel,
  yAxisLabel,
  partialLabel,
  onHover,
  ariaLabel,
}: StackedColumnChartProps) => {
  const lastIndex = data.length - 1;
  const totalLabel = (props: unknown) => {
    const { x = 0, y = 0, width = 0, index = 0 } = props as { x?: number; y?: number; width?: number; index?: number };
    const d = data[index];
    if (!d) return null;
    return (
      <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={14} fontWeight={700} fill={COLORS.navy}>
        {d.primary + d.secondary}
      </text>
    );
  };
  return (
    <div role="img" aria-label={ariaLabel} className="size-full min-h-[120px]">
      <ResponsiveContainer width="100%" height="100%" minHeight={120}>
        <BarChart
          data={data}
          margin={{ top: 22, right: 10, bottom: 22, left: 14 }}
          onMouseMove={(state, event) => {
            const index = Number(state?.activeTooltipIndex);
            const native = (event as unknown as { clientX?: number; clientY?: number }) ?? {};
            if (Number.isFinite(index)) onHover?.(index, native.clientX ?? 0, native.clientY ?? 0);
          }}
        >
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="label"
            tick={(p: Omit<TickProps, 'lastIndex' | 'partial' | 'partialLabel' | 'dense'>) => (
              <XTick {...p} lastIndex={lastIndex} partial={Boolean(data[lastIndex]?.partial)} partialLabel={partialLabel} dense={data.length > 8} />
            )}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: COLORS.ink3, strokeWidth: 2 }}
            height={40}
            label={{ value: xAxisLabel, position: 'insideBottom', offset: -16, className: 'uppercase', fontSize: 12.6, fontWeight: 600, fill: COLORS.blued }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={{ stroke: COLORS.ink3, strokeWidth: 2 }}
            tick={{ fontSize: 13, fontWeight: 600, fill: COLORS.ink3 }}
            width={40}
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -6, style: { textAnchor: 'middle' }, fontSize: 12.6, fontWeight: 600, fill: COLORS.blued }}
          />
          <Bar dataKey="primary" stackId="writers" fill={primaryColor} maxBarSize={46} isAnimationActive animationDuration={700}>
            {data.map((d) => (
              <Cell key={`p-${d.label}`} fillOpacity={d.partial ? 0.6 : 1} />
            ))}
            <LabelList dataKey="primary" content={segmentLabel} />
          </Bar>
          <Bar dataKey="secondary" stackId="writers" fill={secondaryColor} radius={[3, 3, 0, 0]} maxBarSize={46} isAnimationActive animationDuration={700}>
            {data.map((d) => (
              <Cell key={`s-${d.label}`} fillOpacity={d.partial ? 0.6 : 1} />
            ))}
            <LabelList dataKey="secondary" content={segmentLabel} />
            <LabelList dataKey="secondary" content={totalLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default memo(StackedColumnChart);
