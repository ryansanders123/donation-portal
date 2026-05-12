import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // brand palette resolves to per-org CSS variables emitted by
        // <BrandStyle /> in app/(app)/layout.tsx. globals.css ships the
        // CCMC burgundy defaults for anonymous routes.
        brand: {
          DEFAULT: "rgb(var(--brand-700) / <alpha-value>)",
          light:   "rgb(var(--brand-300) / <alpha-value>)",
          50:  "rgb(var(--brand-50)  / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17, 17, 17, 0.04), 0 1px 3px rgba(17, 17, 17, 0.06)",
        card: "0 1px 2px rgba(17, 17, 17, 0.04), 0 2px 8px rgba(17, 17, 17, 0.05)",
        pop: "0 4px 20px -4px rgba(17, 17, 17, 0.12), 0 2px 6px -2px rgba(17, 17, 17, 0.06)",
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(2px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
