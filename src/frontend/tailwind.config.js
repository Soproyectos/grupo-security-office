/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Grupo Security — Paleta oficial de marca (#CE0203 / #484748)
        security: {
          50: '#FFF5F5',
          100: '#FFE0E0',
          200: '#FFB8B8',
          300: '#FF8A8A',
          400: '#FF5252',
          500: '#CE0203',  // PRIMARY — rojo institucional
          600: '#AD0102',
          700: '#8B0102',
          800: '#6A0101',
          900: '#480101',
          950: '#240000',
        },

        // Escala fría del diseño de dashboards (equivale a `slate` de Tailwind).
        // Se agrega con nombre propio en vez de redefinir `neutral`, que está
        // anclada al gris institucional #484748 y la usa el resto de la app:
        // tocarla cambiaría el aspecto de pantallas ya entregadas.
        surface: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
        },
        ink: {
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          900: '#0F172A',
        },

        neutral: {
          50: '#FFFFFF',
          100: '#F5F5F5',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#A0A0A0',
          500: '#737373',
          600: '#5C5B5C',
          700: '#525152',
          800: '#484748',  // PRIMARY — gris oscuro institucional
          900: '#3A393A',
        },
        brand: {
          primary: '#CE0203',
          'primary-hover': '#AD0102',
          'primary-light': '#FFF5F5',
          'primary-subtle': '#FFE0E0',
          secondary: '#484748',
          'secondary-hover': '#3A393A',
          success: '#059669',
          'success-light': '#ECFDF5',
          warning: '#D97706',
          'warning-light': '#FFFBEB',
          error: '#DC2626',
          'error-light': '#FEF2F2',
        },
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', '-apple-system', 'sans-serif'],
        condensed: ['Roboto Condensed', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'h1': ['2rem', { lineHeight: '1.2', fontWeight: '700' }],
        'h2': ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
        'h3': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],

        // --- Escala del diseño de dashboards (Fase 2) ---
        // El diseño usa medios puntos (10.5, 11.5, 12.5) que no existen en la
        // escala por defecto de Tailwind. Se nombran para que ningún TSX tenga
        // que escribir `text-[12.5px]`.
        'eyebrow': ['0.656rem', { lineHeight: '1', letterSpacing: '0.05em', fontWeight: '700' }],
        'micro': ['0.719rem', { lineHeight: '1.3' }],
        'caption': ['0.781rem', { lineHeight: '1.4' }],
        'body-sm': ['0.813rem', { lineHeight: '1.45' }],
        'panel-title': ['0.938rem', { lineHeight: '1.3', fontWeight: '700' }],
        'page-title': ['1.625rem', { lineHeight: '1.2', fontWeight: '700' }],
        'metric': ['1.688rem', { lineHeight: '1.1', fontWeight: '700' }],
      },
      borderRadius: {
        // Radios del diseño: 10px en controles, 14px en tablas, 16px en tarjetas.
        'control': '0.625rem',
        'panel': '0.875rem',
        'card': '1rem',
      },
    },
  },
  plugins: [],
}