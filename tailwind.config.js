/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070816",
        panel: "rgba(18, 20, 42, 0.72)",
        line: "rgba(255, 255, 255, 0.1)",
        violet: "#8b5cf6",
      },
      boxShadow: {
        glow: "0 24px 80px rgba(91, 33, 182, 0.28)",
      },
    },
  },
  plugins: [],
};
