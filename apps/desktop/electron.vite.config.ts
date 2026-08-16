import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// workspace 包是 TS 源码，必须参与打包（不能 external）
const deps = externalizeDepsPlugin({
  exclude: ['@booktool/shared', '@booktool/mdtypst', 'react', 'react-dom'],
})

export default defineConfig({
  main: {
    plugins: [deps],
    resolve: {
      alias: {
        '@booktool/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@booktool/mdtypst': resolve(__dirname, '../../packages/mdtypst/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [deps],
    resolve: {
      alias: {
        '@booktool/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    plugins: [react()],
    resolve: {
      alias: {
        '@booktool/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@booktool/mdtypst': resolve(__dirname, '../../packages/mdtypst/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') },
      },
    },
  },
})
