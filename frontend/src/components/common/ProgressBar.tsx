import { LinearProgress } from '@mui/material';
import { memo } from 'react';
import { COLORS } from '../../constants/colors';

interface ProgressBarProps {
  value: number;
  tone?: 'warn' | 'good';
  label: string;
}

/** 8px rounded progress bar that animates to its value (POC `.bar`). */
const ProgressBar = ({ value, tone = 'warn', label }: ProgressBarProps) => (
  <LinearProgress
    variant="determinate"
    value={Math.max(0, Math.min(100, value))}
    aria-label={label}
    sx={{
      flex: 1,
      minWidth: 60,
      height: 8,
      borderRadius: 999,
      backgroundColor: '#B9C7D6',
      '& .MuiLinearProgress-bar': {
        borderRadius: 999,
        backgroundColor: tone === 'good' ? COLORS.greenb : COLORS.warnb,
        transition: 'transform 1.1s cubic-bezier(.2,.8,.3,1)',
      },
    }}
  />
);

export default memo(ProgressBar);
