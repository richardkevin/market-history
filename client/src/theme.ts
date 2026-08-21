'use client';

import { createTheme, type Shadows } from '@mui/material/styles';

export const brand = {
  green: '#16a34a',
  greenDark: '#22c55e',
  orange: '#ea580c',
  indigo: '#6366f1',
  sky: '#0ea5e9',
};

const sharedTypography = {
  fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
  button: { textTransform: 'none' as const, fontWeight: 600 },
  h4: { fontWeight: 800, letterSpacing: '-0.02em' },
  h5: { fontWeight: 700, letterSpacing: '-0.01em' },
  h6: { fontWeight: 700 },
};

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: brand.green },
        secondary: { main: brand.orange },
        background: { default: '#f4f6fa', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: brand.greenDark },
        secondary: { main: '#fb923c' },
        background: { default: '#0b1120', paper: '#111a2e' },
      },
    },
  },
  shape: { borderRadius: 14 },
  typography: sharedTypography,
  shadows: [
    'none',
    '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
    '0 2px 4px rgba(15, 23, 42, 0.05), 0 4px 12px rgba(15, 23, 42, 0.08)',
    ...Array.from({ length: 22 }, () => '0 4px 16px rgba(15, 23, 42, 0.10)'),
  ] as Shadows,
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: 'rgba(100, 116, 139, 0.2)' },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          fontSize: '0.75rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});
