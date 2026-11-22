// Colours come from CSS variables in src/app/colors.scss: change them there,
// never hard-code hex values in components
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,html}', '../../libraries/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--p3d-bg)',
        bgInner: 'var(--p3d-bg-inner)',
        line: 'var(--p3d-line)',
        textColor: 'var(--p3d-text)',
        textMuted: 'var(--p3d-text-muted)',
        accent: 'var(--p3d-accent)',
        accentText: 'var(--p3d-accent-text)',
        danger: 'var(--p3d-danger)',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
