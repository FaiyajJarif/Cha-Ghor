/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cg: {
          ink: "#14261a",
          dark: "#1c3a29",
          darker: "#122018",
          green: "#3f8f43",
          bright: "#34c07a",
          lime: "#dcefba",
          header: "#edf7f7",
          leaf1: "#49921c",
          leaf2: "#a9b263",
          blend: "#5c796c",
        },
      },
    },
  },
  plugins: [],
};
