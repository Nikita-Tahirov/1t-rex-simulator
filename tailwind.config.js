// Tailwind 4 сам подбирает контент через @import + @theme в CSS.
// Файл оставлен как fallback для редакторов и tooling, которые читают config явно.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};
