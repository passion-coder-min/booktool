import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// workspace 包是 TS 源码，必须参与打包（不能 external）。
// main 运行时依赖（main/preload 直接 import：p-limit/smol-toml/yaml；
// mdtypst/shared 传递：remark 生态/unified/zod）也一并打包：
// 产物自包含后 asar 无需携带 node_modules（原 app.asar 218MB → ~36MB）。
const deps = externalizeDepsPlugin({
  exclude: [
    '@booktool/shared',
    '@booktool/mdtypst',
    'react',
    'react-dom',
    'p-limit',
    'smol-toml',
    'yaml',
    'unified',
    'remark-parse',
    'remark-directive',
    'remark-gfm',
    'remark-math',
    'remark-frontmatter',
    'zod',
    'mdast',
  ],
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
      // dev 模式 watch 范围：只盯应用源码与 workspace 包（会改的），
      // 不 watch 参与 bundle 的 node_modules 依赖（remark 生态数千文件，
      // 低 fd 上限机器上触发 EMFILE: too many open files）。构建产物不受影响。
      watch: {
        include: [
          resolve(__dirname, 'electron/**'),
          resolve(__dirname, '../../packages/*/src/**'),
        ],
      },
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
      watch: {
        include: [
          resolve(__dirname, 'electron/**'),
          resolve(__dirname, '../../packages/*/src/**'),
        ],
      },
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
