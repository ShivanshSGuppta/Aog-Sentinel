import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pearl: "#F8F9F7",
        aqua: "#7ED7E0",
        ink: {
          950: "#071421",
          900: "#0B203D",
          800: "#173453",
          700: "#284969",
        },
        slate: {
          50: "#F5F8FB",
          100: "#EAF0F5",
          200: "#D6E1E8",
          300: "#B8C6D3",
          400: "#90A4B8",
          500: "#6B8096",
          600: "#4E667C",
          700: "#334A62",
        },
        success: "#0F766E",
        warning: "#C97A12",
        danger: "#B73A3A",
      },
      fontFamily: {
        sans: ["var(--font-plex)", "ui-sans-serif", "sans-serif"],
        display: ["var(--font-space)", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        panel: "0 18px 42px rgba(11, 32, 61, 0.08)",
      },
      backgroundImage: {
        radar: "radial-gradient(circle at top right, rgba(126, 215, 224, 0.22), transparent 35%), linear-gradient(180deg, rgba(11, 32, 61, 0.03), transparent 18%)",
      },
    },
  },
  plugins: [],
};

export default config;
