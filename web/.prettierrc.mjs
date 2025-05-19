// @ts-check

/** @type {import("prettier").Config} */
export default {
  plugins: ['prettier-plugin-astro', 'prettier-plugin-tailwindcss'],
  overrides: [
    {
      files: '*.astro',
      options: {
        parser: 'astro',
      },
    },
  ],
  tailwindFunctions: ['cn', 'clsx', 'tv'],
  singleQuote: true,
  semi: false,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 110,
  bracketSpacing: true,
  endOfLine: 'lf',
}
