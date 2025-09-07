/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: "#7dd3fc", // light blue
          DEFAULT: "#0ea5e9", // sky blue
          dark: "#0369a1",   // dark blue
        },
        secondary: {
          light: "#c084fc", 
          DEFAULT: "#a855f7", 
          dark: "#6b21a8",
        },
        accent: {
          DEFAULT: "#facc15", // yellow
        },
        background: {
          DEFAULT: "#0f172a", // deep slate
          card: "#1e293b",    // card backgrounds
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
