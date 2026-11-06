import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: 'plugin/index.ts' },
    outDir: 'lib', format: 'esm', platform: 'node', target: 'es2022',
    dts: false, clean: false,
    deps: { neverBundle: [/^@deepseek-ai\//, 'open', '../index.cjs'] },
    outputOptions: { entryFileNames: 'index.mjs' },
  },
  {
    entry: { client: 'client/index.tsx' },
    outDir: 'lib', format: 'cjs', platform: 'browser', target: 'es2022',
    dts: false, clean: false,
    tsconfig: 'tsconfig.client.json',
    inputOptions: { platform: 'browser' },
    deps: {
      neverBundle: ['react', 'react/jsx-runtime'],
      alwaysBundle: [/^@radix-ui\//, 'class-variance-authority', 'clsx', 'lucide-react', 'tailwind-merge'],
    },
    outputOptions: {
      codeSplitting: false,
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-codex-provider", factory: (require) => {',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
