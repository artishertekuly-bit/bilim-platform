import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      '.venv',
      'backend/.venv',
      'src/integrations/supabase/types.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    files: [
      'src/components/ui/badge.tsx',
      'src/components/ui/button.tsx',
      'src/components/ui/form.tsx',
      'src/components/ui/navigation-menu.tsx',
      'src/components/ui/sidebar.tsx',
      'src/components/ui/sonner.tsx',
      'src/components/ui/toggle.tsx',
      'src/lib/auth-context.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  }
);