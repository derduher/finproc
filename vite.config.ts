import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Served from a subpath of nimblerendition.com, which hosts several apps out
  // of one bucket. Keep this in step with the S3 prefix in
  // .github/workflows/deploy.yml.
  base: '/threadwell/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  worker: {
    format: 'es',
  },
})
