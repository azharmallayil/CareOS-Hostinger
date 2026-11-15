/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand
        primary: {
          100: "#DBEAFE",
          500: "#2563EB",
          600: "#1D4ED8",
          700: "#1E40AF",
        },
        accent: {
          100: "#E0F2FE",
          500: "#0EA5E9",
        },
        // Semantic status colours
        success: {
          bg: "#D1FAE5",
          border: "#34D399",
          text: "#065F46",
        },
        warning: {
          bg: "#FEF3C7",
          border: "#FBBF24",
          text: "#92400E",
        },
        error: {
          bg: "#FEE2E2",
          border: "#F87171",
          text: "#991B1B",
        },
        info: {
          bg: "#DBEAFE",
          border: "#60A5FA",
          text: "#1E3A8A",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        arabic: ["IBM Plex Sans Arabic", "Noto Sans Arabic", "sans-serif"],
      },
      fontSize: {
        xs: ["11px", { lineHeight: "1.5" }],
        sm: ["13px", { lineHeight: "1.5" }],
        base: ["15px", { lineHeight: "1.6" }],
        md: ["16px", { lineHeight: "1.5" }],
        lg: ["18px", { lineHeight: "1.4" }],
        xl: ["20px", { lineHeight: "1.3" }],
        "2xl": ["24px", { lineHeight: "1.2" }],
        "3xl": ["30px", { lineHeight: "1.2" }],
      },
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        6: "24px",
        8: "32px",
        12: "48px",
        16: "64px",
      },
    },
  },
  plugins: [],
};
