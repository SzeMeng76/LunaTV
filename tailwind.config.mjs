/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Tailwind 4 使用 CSS @theme 和 @custom-variant 定义主题
  // 大部分配置已迁移到 src/app/globals.css
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

export default config;
