// Theme tokens for Bloomberg-style black/green aesthetic
export const theme = {
  colors: {
    bg: '#0A0A0A',
    bgElevated: '#0F0F0F',
    bgHover: '#151515',
    textPrimary: '#E0E0E0',
    textMuted: '#7AF0AE',
    textAccent: '#00FF84',
    accent: '#00FF84',
    accentHover: '#00FF99',
    accentDim: '#00CC6A',
    border: '#1E1E1E',
    borderAccent: '#00FF84',
    danger: '#FF4444',
    dangerDim: '#CC3333',
    success: '#00FF84',
    warning: '#FFAA00',
    gridline: '#0D0D0D',
  },
  shadows: {
    softGlow: '0 0 8px rgba(0, 255, 132, 0.15)',
    hardGlow: '0 0 16px rgba(0, 255, 132, 0.25)',
    neon: '0 0 20px rgba(0, 255, 132, 0.4)',
    inset: 'inset 0 0 8px rgba(0, 255, 132, 0.1)',
  },
  radii: {
    sm: '4px',
    md: '6px',
    lg: '8px',
  },
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
  },
  fontSizes: {
    xs: '11px',
    sm: '12px',
    md: '14px',
    lg: '16px',
    xl: '18px',
    '2xl': '20px',
    '3xl': '24px',
  },
  fontWeights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export type Theme = typeof theme;
