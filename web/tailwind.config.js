/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Navy, not slate: more saturated and bluer than Tailwind's default slate,
        // which reads grey-blue rather than navy.
        navy: {
          950: "#050d28",
          900: "#0b1c4b",
          850: "#0f2559",
          800: "#142f68",
          700: "#1e4090",
          600: "#2a54b8",
        },
      },
      fontFamily: {
        // Self-hosted so the app has no font dependency on the network.
        brand: ["Comfortaa", "Poppins", "ui-rounded", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
