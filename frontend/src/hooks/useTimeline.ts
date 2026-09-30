import { useEffect, useRef, useState } from 'react';

/**
 * Plays a sequence of delays and returns how many have elapsed (the stage).
 * `delays[i]` is the wait before stage i+1. Starts when `active` is true.
 * Remount (change the React key) to replay; `onDone` fires after the last stage.
 */
export const useTimeline = (delays: readonly number[], active: boolean, onDone?: () => void): number => {
  const [stage, setStage] = useState(0);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const signature = delays.join(',');
  useEffect(() => {
    if (!active) return undefined;
    const waits = signature ? signature.split(',').map(Number) : [];
    let elapsed = 0;
    const timers = waits.map((wait, index) => {
      elapsed += wait;
      return setTimeout(() => {
        setStage(index + 1);
        if (index === waits.length - 1) doneRef.current?.();
      }, elapsed);
    });
    return () => timers.forEach(clearTimeout);
  }, [active, signature]);

  return stage;
};
