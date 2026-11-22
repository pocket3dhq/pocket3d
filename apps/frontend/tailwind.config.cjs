// Colours come from CSS variables in src/app/colors.scss: change them there,
// never hard-code hex values in components
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,html}', '../../libraries/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--p3d-bg) / <alpha-value>)',
        bgInner: 'rgb(var(--p3d-bg-inner) / <alpha-value>)',
        line: 'rgb(var(--p3d-line) / <alpha-value>)',
        textColor: 'rgb(var(--p3d-text) / <alpha-value>)',
        textMuted: 'rgb(var(--p3d-text-muted) / <alpha-value>)',
        accent: 'rgb(var(--p3d-accent) / <alpha-value>)',
        accentText: 'rgb(var(--p3d-accent-text) / <alpha-value>)',
        danger: 'rgb(var(--p3d-danger) / <alpha-value>)',
        success: 'rgb(var(--p3d-success) / <alpha-value>)',
      },
      // Inter for text, IBM Plex Mono for buttons, labels, card titles and
      // code (both loaded in app/layout.tsx with next/font)
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      borderRadius: {
        // buttons, inputs, chips
        control: '4px',
        // code blocks and floating panels
        panel: '10px',
      },
      letterSpacing: {
        // big headings
        display: '-0.04em',
        heading: '-0.02em',
      },
    },
  },
  plugins: [],
};
