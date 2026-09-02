import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // External media and wallet adapters still expose untyped boundaries. Keep
      // those visible without preventing the rest of the lint gate from running.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // These modules intentionally re-export component helpers from the same
    // public entry point; Fast Refresh's component-only rule cannot prove them.
    files: [
      'src/components/AudioCVGraph.tsx',
      'src/components/AudioControls.tsx',
      'src/components/AudioSection.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
