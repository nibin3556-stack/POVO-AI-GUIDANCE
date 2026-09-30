import { createTheme, type Theme } from '@mui/material/styles';
import { COLORS, SHADOWS } from '../constants/colors';

/** Central MUI theme mirroring the POC tokens (spec §9). Tailwind @theme mirrors the same values. */
export const getTheme = (): Theme =>
  createTheme({
    palette: {
      mode: 'light',
      primary: { main: COLORS.blue, dark: COLORS.blued, light: COLORS.bluet, contrastText: COLORS.white },
      secondary: { main: COLORS.purple, dark: COLORS.purple2, light: COLORS.purplel, contrastText: COLORS.white },
      success: { main: COLORS.green, light: COLORS.greenbg },
      warning: { main: COLORS.warn, light: COLORS.warnbg },
      error: { main: COLORS.red, dark: COLORS.red2 },
      background: { default: COLORS.bg, paper: COLORS.white },
      text: { primary: COLORS.ink, secondary: COLORS.ink3 },
      divider: COLORS.line2,
    },
    shape: { borderRadius: 9 },
    typography: {
      fontFamily: "'Heebo Variable', 'Heebo', system-ui, sans-serif",
      htmlFontSize: 16,
      fontSize: 14,
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 9, fontSize: 14 } },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 9,
            backgroundColor: COLORS.white,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.line, borderWidth: 1.5 },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.blue },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 14, boxShadow: SHADOWS.modal, overflow: 'hidden' },
        },
      },
      MuiBackdrop: {
        styleOverrides: { root: { backgroundColor: 'rgba(12,28,48,.55)' } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: COLORS.white,
            color: COLORS.ink2,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 10,
            boxShadow: SHADOWS.pop,
            fontSize: 13,
            fontWeight: 500,
            padding: '8px 12px',
            maxWidth: 520,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: 10, border: `1px solid ${COLORS.line}`, boxShadow: SHADOWS.menu },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: { borderRadius: 10, border: `1px solid ${COLORS.line}`, boxShadow: SHADOWS.menu },
        },
      },
    },
  });
