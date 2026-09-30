import { memo, type MouseEvent } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis, useChartWidth, usePlotArea } from 'recharts';
import { CHART_COLORS, COLORS, TIER_BAND, type TierCode } from '../../constants/colors';

export interface DecileBarRow {
  label: string;
  tier: TierCode;
  targets: number;
  writers: number;
}

export interface TierBand {
  tier: TierCode;
  name: string;
  /** Row index where the band starts and how many rows it covers. */
  start: number;
  count: number;
}

interface DecileBarChartProps {
  rows: DecileBarRow[];
  bands: TierBand[];
  suffix: (writers: number, targets: number) => string;
  activeIndex?: number | null;
  onHover?: (index: number, clientX: number, clientY: number) => void;
  ariaLabel: string;
}

/** Tier background bands with rotated labels, drawn from the plot area geometry. */
const Bands = ({ bands, rowCount }: { bands: TierBand[]; rowCount: number }) => {
  const plot = usePlotArea();
  const width = useChartWidth() ?? 0;
  if (!plot || !rowCount) return null;
  const pitch = plot.height / rowCount;
  return (
    <g aria-hidden="true">
      {bands.map((band) => {
        const y = plot.y + pitch * band.start;
        const h = pitch * band.count;
        const c = TIER_BAND[band.tier];
        const fontSize = Math.max(8.5, Math.min(11.5, (h - 8) / (band.name.length * 0.62)));
        return (
          <g key={band.tier}>
            <rect x={0} y={y + 1} width={width} height={h - 2} rx={7} fill={c.fill} stroke={c.stroke} />
            <text transform={`translate(15,${y + h / 2}) rotate(-90)`} textAnchor="middle" fontSize={fontSize} fontWeight={700} fill={c.text}>
              {band.name}
            </text>
          </g>
        );
      })}
    </g>
  );
};

interface YTickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string; index: number };
  rows: DecileBarRow[];
}

/** "D10" labels in their tier colour. */
const YTick = ({ x = 0, y = 0, payload, rows }: YTickProps) => {
  const row = rows[payload?.index ?? -1];
  return (
    <text x={Number(x) - 4} y={Number(y) + 5} textAnchor="end" fontSize={14} fontWeight={700} fill={row ? TIER_BAND[row.tier].text : COLORS.ink3}>
      {payload?.value}
    </text>
  );
};

/** Transparent row hit areas on top of the bars (hover anywhere on the row). */
const RowHits = ({ rowCount, activeIndex, onHover }: { rowCount: number; activeIndex: number | null; onHover?: DecileBarChartProps['onHover'] }) => {
  const plot = usePlotArea();
  const width = useChartWidth() ?? 0;
  if (!plot || !rowCount) return null;
  const pitch = plot.height / rowCount;
  return (
    <g>
      {Array.from({ length: rowCount }, (_, index) => (
        <rect
          key={`hit-${index}`}
          data-testid="decile-row"
          x={0}
          y={plot.y + pitch * index}
          width={width}
          height={pitch}
          className="cursor-pointer"
          fill={activeIndex === index ? 'rgba(21,108,180,.07)' : 'transparent'}
          onMouseMove={(e: MouseEvent<SVGRectElement>) => onHover?.(index, e.clientX, e.clientY)}
        />
      ))}
    </g>
  );
};

/** Horizontal overlaid bars per decile: amber = targets, green = writers on top, "w of t HCPs" on the right. */
const DecileBarChart = ({ rows, bands, suffix, activeIndex = null, onHover, ariaLabel }: DecileBarChartProps) => (
  <div role="img" aria-label={ariaLabel} className="size-full min-h-[120px]">
    <ResponsiveContainer width="100%" height="100%" minHeight={120}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 104, bottom: 4, left: 0 }} barCategoryGap="45%" barGap="-100%">
        <Bands bands={bands} rowCount={rows.length} />
        <XAxis type="number" hide domain={[0, 'dataMax']} />
        <YAxis
          type="category"
          dataKey="label"
          width={64}
          axisLine={false}
          tickLine={false}
          tick={(p: Omit<YTickProps, 'rows'>) => <YTick {...p} rows={rows} />}
        />
        <Bar dataKey="targets" fill={CHART_COLORS.yetToWrite} radius={3} isAnimationActive animationDuration={800} maxBarSize={24}>
          <LabelList
            dataKey="targets"
            content={(props) => {
              const { x = 0, y = 0, width = 0, height = 0, index = 0 } = props as { x?: number; y?: number; width?: number; height?: number; index?: number };
              const row = rows[index];
              if (!row) return null;
              return (
                <text x={Number(x) + Number(width) + 8} y={Number(y) + Number(height) / 2 + 5} fontSize={13.4} fontWeight={700} fill={COLORS.ink}>
                  {row.writers}
                  <tspan fontWeight={500} fill={COLORS.ink3}>
                    {suffix(row.writers, row.targets)}
                  </tspan>
                </text>
              );
            }}
          />
        </Bar>
        <Bar dataKey="writers" fill={CHART_COLORS.writing} radius={3} isAnimationActive animationDuration={800} maxBarSize={24} />
        <RowHits rowCount={rows.length} activeIndex={activeIndex} onHover={onHover} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default memo(DecileBarChart);
