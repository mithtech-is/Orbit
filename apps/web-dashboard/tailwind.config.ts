import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Tailwind v3 for shadcn/ui. Preflight is DISABLED so Tailwind coexists with the
 * legacy hand-written styles.css during the page-by-page migration — utilities
 * and shadcn components specify their own colors/borders explicitly, so they
 * don't depend on the global reset. Dark mode follows the app's existing
 * `data-theme="dark"` attribute (set by the theme toggle), not a `.dark` class.
 */
const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-ibm-plex-sans)", "IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "IBM Plex Mono", "ui-monospace", "monospace"]
      },
      colors: {
        // Namespaced `--sc-*` tokens so shadcn's HSL palette never clobbers the
        // legacy styles.css variables (--primary/--background/--border are hex
        // there). See app/globals.css.
        border: "hsl(var(--sc-border))",
        input: "hsl(var(--sc-input))",
        ring: "hsl(var(--sc-ring))",
        background: "hsl(var(--sc-background))",
        foreground: "hsl(var(--sc-foreground))",
        primary: {
          DEFAULT: "hsl(var(--sc-primary))",
          foreground: "hsl(var(--sc-primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--sc-secondary))",
          foreground: "hsl(var(--sc-secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--sc-destructive))",
          foreground: "hsl(var(--sc-destructive-foreground))"
        },
        success: {
          DEFAULT: "hsl(var(--sc-success))",
          foreground: "hsl(var(--sc-success-foreground))"
        },
        warning: {
          DEFAULT: "hsl(var(--sc-warning))",
          foreground: "hsl(var(--sc-warning-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--sc-muted))",
          foreground: "hsl(var(--sc-muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--sc-accent))",
          foreground: "hsl(var(--sc-accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--sc-popover))",
          foreground: "hsl(var(--sc-popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--sc-card))",
          foreground: "hsl(var(--sc-card-foreground))"
        }
      },
      borderRadius: {
        lg: "var(--sc-radius)",
        md: "calc(var(--sc-radius) - 2px)",
        sm: "calc(var(--sc-radius) - 4px)"
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out"
      }
    }
  },
  plugins: [animate]
};

export default config;
