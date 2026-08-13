export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c1d3ff',
          300: '#a2bdff',
          400: '#8ca7ff',
          500: '#4370ff',
          600: '#264ef5',
          700: '#1e3ce0',
          800: '#182bcb',
          900: '#111b56'
        }
      },
      boxShadow: {
        glow: '0 0 20px rgba(67, 112, 255, 0.5)',
        'glow-emerald': '0 0 20px rgba(16, 185, 129, 0.5)',
        'glow-amber': '0 0 20px rgba(245, 158, 11, 0.5)'
      }
    }
  },
  plugins: []
}
