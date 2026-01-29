// @ts-check
import eslint from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import eslintParserAstro from 'astro-eslint-parser'
import { defineConfig } from 'eslint/config'
import eslintPluginAstro from 'eslint-plugin-astro'
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss'
import importPlugin from 'eslint-plugin-import'
import globals from 'globals'
import { without } from 'lodash-es'
import tseslint, { parser as eslintParserTypeScript } from 'typescript-eslint'

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '.astro/**',
      'dist/**',
      'coverage/**',
      'build/**',
      'public/**',
      '.prettierrc.mjs',
    ],
  },
  {
    files: ['**/*.{js,ts,mjs,cjs,tsx,jsx,astro}'],
  },
  {
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: 'tsconfig.json',
        },
      },
    },
  },
  eslint.configs.recommended,
  // eslint-disable-next-line import/no-named-as-default-member
  tseslint.configs.strictTypeChecked,
  // eslint-disable-next-line import/no-named-as-default-member
  tseslint.configs.stylisticTypeChecked,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  importPlugin.flatConfigs.recommended,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  importPlugin.flatConfigs.typescript,
  // eslint-disable-next-line import/no-named-as-default-member
  eslintPluginAstro.configs['flat/recommended'],
  // eslint-disable-next-line import/no-named-as-default-member
  eslintPluginAstro.configs['flat/jsx-a11y-strict'],
  eslintPluginBetterTailwindcss.configs.recommended,
  [
    // These rules don't work with Astro and produce false positives
    {
      files: ['**/*.astro'],
      rules: {
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
      },
    },
    {
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
      },
    },
  ],
  {
    files: ['**/*.astro'],
    languageOptions: {
      parser: eslintParserAstro,
      parserOptions: {
        parser: eslintParserTypeScript,
      },
    },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/styles/global.css',
      },
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/no-deprecated': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/consistent-type-definitions': ['warn', 'type'],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/sort-type-constituents': 'error',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
          pathGroups: [
            {
              pattern: 'react',
              group: 'external',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['react'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
      'import/no-unresolved': ['error', { ignore: ['^astro:', '^virtual:'] }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: without(Object.keys(console), 'log') }],
      'import/namespace': 'off',
      'object-shorthand': ['warn', 'always', { avoidExplicitReturnArrows: false }],
      'no-useless-rename': 'warn',
      curly: ['error', 'multi-line'],
      '@stylistic/quotes': [
        'error',
        'single',
        {
          avoidEscape: true,
          allowTemplateLiterals: 'never',
        },
      ],
      'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
      'better-tailwindcss/enforce-canonical-classes': 'off',
      'better-tailwindcss/no-unknown-classes': ['error', { ignore: ['custom-.*', 'not-prose'] }],
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
)
