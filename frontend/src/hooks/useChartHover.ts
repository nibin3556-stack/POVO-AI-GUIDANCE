import { useCallback, useState } from 'react';

export interface ChartHover {
  index: number;
  clientX: number;
  clientY: number;
}

/** Which item of a chart is hovered, and where the pointer is (for the side tooltip). */
export const useChartHover = () => {
  const [hover, setHover] = useState<ChartHover | null>(null);
  const onHover = useCallback((index: number, clientX: number, clientY: number) => {
    setHover((prev) => (prev && prev.index === index && Math.abs(prev.clientY - clientY) < 4 ? prev : { index, clientX, clientY }));
  }, []);
  const onLeave = useCallback(() => setHover(null), []);
  return { hover, onHover, onLeave };
};
