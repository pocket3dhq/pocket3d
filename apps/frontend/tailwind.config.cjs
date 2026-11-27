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
        axisX: 'rgb(var(--p3d-axis-x) / <alpha-value>)',
        axisY: 'rgb(var(--p3d-axis-y) / <alpha-value>)',
        axisZ: 'rgb(var(--p3d-axis-z) / <alpha-value>)',
        wire: 'rgb(var(--p3d-wire) / <alpha-value>)',
        vertex: 'rgb(var(--p3d-vertex) / <alpha-value>)',
        normal: 'rgb(var(--p3d-normal) / <alpha-value>)',
        bbox: 'rgb(var(--p3d-bbox) / <alpha-value>)',
        clay: 'rgb(var(--p3d-clay) / <alpha-value>)',
        faceFront: 'rgb(var(--p3d-face-front) / <alpha-value>)',
        faceBack: 'rgb(var(--p3d-face-back) / <alpha-value>)',
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
