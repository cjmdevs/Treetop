/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent:        'rgb(var(--color-accent) / <alpha-value>)',
        'accent-dark': 'rgb(var(--color-accent-dark) / <alpha-value>)',
        'accent-light':'rgb(var(--color-accent-light) / <alpha-value>)',
        secondary:     'rgb(var(--color-secondary) / <alpha-value>)',
        sidebar:       'rgb(var(--color-sidebar) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui'],
        mono: ['"DM Mono"', 'ui-monospace'],
      },
    },
  },
  plugins: [],
}
