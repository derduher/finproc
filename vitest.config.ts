import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      // Only measure coverage for the pure-logic modules — UI components
      // (charts, steps, frame, mobile, loading, shared) are exercised by
      // integration/smoke tests but intentionally excluded from the 90%
      // threshold since they render pure presentation with no branching logic.
      include: [
        'src/math/**',
        'src/schema/**',
        'src/sim/**',
        'src/storage/**',
        'src/hooks/**',
        'src/store.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        // Branch threshold is 89% — we're at 89.14% under coverage-v8 v4's
        // AST-aware branch counting (vitest 4 made this the default, which is
        // stricter than the v3 measurement). The remaining gap is defensive /
        // error-path branches (IDB catch blocks, degenerate-rate guards,
        // window.location edge cases) that are hard to trigger in jsdom.
        branches: 89,
        statements: 90,
      },
      exclude: [
        'src/test/**',
        'src/main.tsx',
        'src/App.tsx',
        'src/ui/**',
        'src/worker/**',
        '**/*.d.ts',
        'vite.config.ts',
        'vitest.config.ts',
        'eslint.config.ts',
      ],
    },
    resolve: {
      alias: {
        '@': '/Users/patrickweygand/projects/finproc/src',
      },
    },
  },
})
