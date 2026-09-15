// Builds the extension host bundle (Node/CJS) and one browser bundle per webview module.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

const builds = [
  {
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
    // Prefer ESM builds: some UMD builds (jsonc-parser) use dynamic requires esbuild cannot bundle.
    mainFields: ['module', 'main'],
  },
  {
    ...shared,
    entryPoints: {
      gherkin: 'src/modules/gherkin/webview/main.tsx',
      catalog: 'src/webview/catalog/main.tsx',
      openapi: 'src/modules/openapi/webview/main.tsx',
      asyncapi: 'src/modules/asyncapi/webview/main.tsx',
      proto: 'src/modules/proto/webview/main.tsx',
      opencli: 'src/modules/opencli/webview/main.tsx',
      spec: 'src/modules/spec/webview/main.tsx',
      otm: 'src/modules/otm/webview/main.tsx',
      backstage: 'src/modules/backstage/webview/main.tsx',
      openslo: 'src/modules/openslo/webview/main.tsx',
      prompts: 'src/modules/prompts/webview/main.tsx',
      adr: 'src/modules/adr/webview/main.tsx',
    },
    outdir: 'dist/webview',
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    jsx: 'automatic',
    loader: { '.css': 'css' },
    define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') },
  },
];

function copyAssets() {
  rmSync('dist', { recursive: true, force: true });
  mkdirSync('dist/webview', { recursive: true });
  cpSync('node_modules/@vscode/codicons/dist/codicon.css', 'dist/webview/codicon.css');
  cpSync('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/webview/codicon.ttf');
}

copyAssets();
if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
