import { MenuItem, Select } from '@mui/material';
import { memo } from 'react';
import { LABELS } from '../constants/labels';
import { brandSelected } from '../redux/session/sessionSlice';
import { useAppDispatch } from '../redux/hooks';
import type { Me } from '../types/models';

interface BrandSwitcherProps {
  me: Me;
}

const selectSx = {
  height: 30,
  minWidth: 120,
  color: '#fff',
  fontSize: 13.5,
  fontWeight: 600,
  backgroundColor: 'rgba(255,255,255,.1)',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.35)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.7)' },
  '& .MuiSvgIcon-root': { color: '#E4EFF9' },
};

/**
 * Brand selector in the header, shown only to users of more than one brand.
 * Switching drops every cached response and ends impersonation (the store
 * listener), so every figure on screen is the new brand's.
 */
const BrandSwitcher = ({ me }: BrandSwitcherProps) => {
  const dispatch = useAppDispatch();
  if (me.brands.length < 2) return null;
  return (
    <Select
      size="small"
      value={me.brand.code}
      onChange={(e) => dispatch(brandSelected(e.target.value))}
      inputProps={{ 'aria-label': LABELS.header.brandAria }}
      sx={selectSx}
    >
      {me.brands.map((b) => (
        <MenuItem key={b.code} value={b.code}>
          {b.name}
        </MenuItem>
      ))}
    </Select>
  );
};

export default memo(BrandSwitcher);
