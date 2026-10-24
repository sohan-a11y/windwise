/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F3F6F1",
        ink: {
          DEFAULT: "#0E2A2B",
          800: "#173C3B",
          700: "#25504E",
          600: "#3C6562",
          500: "#5B7B77",
          400: "#7E9894",
          300: "#A8BCB8",
          200: "#CBD9D5",
          100: "#E4ECE8",
        },
        teal: {
          DEFAULT: "#0E7C6B",
          700: "#0B6557",
          600: "#0E7C6B",
          500: "#179986",
          400: "#45B6A2",
          300: "#8AD4C5",
          200: "#C4E9DF",
          100: "#E6F5F0",
        },
        sky: {
          DEFAULT: "#5FC4E6",
          400: "#7FD2ED",
          300: "#A8E1F3",
          200: "#D3F0F8",
          100: "#EDF9FC",
        },
        coral: {
          DEFAULT: "#F0705F",
          600: "#DE5A49",
          500: "#F0705F",
          400: "#F59487",
          300: "#F9BBB2",
          200: "#FCDDD8",
          100: "#FEF0ED",
        },
        sand: {
          DEFAULT: "#F3D488",
          500: "#F3D488",
          400: "#F7E1AA",
          300: "#FAEDCB",
          200: "#FDF6E5",
        },
        navy: "#0B2B2A",
      },
      fontFamily: {
        display: ["Instrument Serif", "Georgia", "serif"],
        sans: ["Instrument Sans", "system-ui", "-apple-system", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        soft: "0 32px 90px -48px rgba(14, 42, 43, 0.38)",
        card: "0 1px 0 rgba(255,255,255,0.9) inset, 0 24px 70px -46px rgba(14,42,43,0.42)",
        lift: "0 18px 40px -22px rgba(14,42,43,0.35)",
        stamp: "0 14px 30px -18px rgba(14,42,43,0.5)",
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      letterSpacing: {
        label: "0.18em",
        wider: "0.24em",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-7px)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.9" },
        },
        dash: {
          to: { strokeDashoffset: "-240" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        float: "float 9s ease-in-out infinite",
        "pulse-soft": "pulseSoft 3.2s ease-in-out infinite",
        dash: "dash 14s linear infinite",
        shimmer: "shimmer 1.8s infinite",
        rise: "rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
