/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}", "./src/**/*.html", "./src/**/*.ts"],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#1E2024',
        'dark-bg-2': '#1E2024',
        'brand': {
          50: '#F0EBFF',
          75: '#E7DFFF',
          500: '#6834FF',
        },
        'gray': {
          75: '#EBEDF0',
          700: '#6B727E',
        },
        'tertiary-text': '#AFAFAF',
      },
      fontFamily: {
        sans: ['Nunito Sans', '-apple-system', 'Roboto', 'Helvetica', 'sans-serif'],
      },
      boxShadow: {
        'custom': '0 2px 12px 0 rgba(54, 89, 226, 0.12)',
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
