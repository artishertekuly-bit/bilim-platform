import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  darkMode: 'class',
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.25rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },

      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        surface: {
          DEFAULT: 'hsl(var(--surface))',
          foreground: 'hsl(var(--surface-foreground))',
          soft: 'hsl(var(--surface-soft))',
        },

        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
          muted: 'hsl(var(--primary-muted))',
        },

        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
          soft: 'hsl(var(--secondary-soft))',
          muted: 'hsl(var(--secondary-muted))',
        },

        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          soft: 'hsl(var(--accent-soft))',
          muted: 'hsl(var(--accent-muted))',
        },

        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          soft: 'hsl(var(--destructive-soft))',
          muted: 'hsl(var(--destructive-muted))',
        },

        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          soft: 'hsl(var(--success-soft))',
          muted: 'hsl(var(--success-muted))',
        },

        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          soft: 'hsl(var(--warning-soft))',
          muted: 'hsl(var(--warning-muted))',
        },

        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },

        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
          soft: 'hsl(var(--card-soft))',
        },

        status: {
          new: {
            DEFAULT: 'hsl(var(--status-new))',
            foreground: 'hsl(var(--status-new-foreground))',
          },
          active: {
            DEFAULT: 'hsl(var(--status-active))',
            foreground: 'hsl(var(--status-active-foreground))',
          },
          completed: {
            DEFAULT: 'hsl(var(--status-completed))',
            foreground: 'hsl(var(--status-completed-foreground))',
          },
          important: {
            DEFAULT: 'hsl(var(--status-important))',
            foreground: 'hsl(var(--status-important-foreground))',
          },
          error: {
            DEFAULT: 'hsl(var(--status-error))',
            foreground: 'hsl(var(--status-error-foreground))',
          },
        },

        ai: {
          DEFAULT: 'hsl(var(--ai))',
          foreground: 'hsl(var(--ai-foreground))',
          soft: 'hsl(var(--ai-soft))',
          border: 'hsl(var(--ai-border))',
        },

        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },

      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      boxShadow: {
        soft: 'var(--shadow-soft)',
        'soft-md': 'var(--shadow-soft-md)',
        'soft-lg': 'var(--shadow-soft-lg)',
        'inner-soft': 'var(--shadow-inner-soft)',
      },

      transitionTimingFunction: {
        soft: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-soft': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'soft-pop': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },

      animation: {
        'accordion-down': 'accordion-down 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        'accordion-up': 'accordion-up 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fade-in 220ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'fade-in-soft': 'fade-in-soft 180ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'slide-in-left': 'slide-in-left 200ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'scale-in': 'scale-in 180ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'soft-pop': 'soft-pop 200ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;