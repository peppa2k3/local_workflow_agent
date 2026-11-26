import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const resolve = (path) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: resolve('./ui/'),
  plugins: [
    {
      name: 'control-navigation',
      transformIndexHtml: {
        order: 'pre',
        handler(html, { filename }) {
          const library = filename.endsWith('library.html');
          const links = [
            ['/devices', 'Thiết bị'],
            ['/library', 'Kho video'],
          ].map(
            ([url, label]) =>
              `<a href="${url}"${(url === '/library') === library ? ' aria-current="page"' : ''}>${label}</a>`,
          );
          return html.replace(/\r\n/g, '\n').replace(
            '<!-- navigation -->',
            `<nav class="main-nav" aria-label="Điều hướng chính">${links.join(' ')}</nav>`,
          );
        },
      },
    },
  ],
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: resolve('./web/'),
    emptyOutDir: false,
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
    modulePreload: false,
    rollupOptions: {
      input: { app: resolve('./ui/index.html'), library: resolve('./ui/library.html') },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames(asset) {
          return asset.names.includes('app.css') ? 'style.css' : '[name][extname]';
        },
        manualChunks(id) {
          if (id.includes('/node_modules/') || id.endsWith('/shared/api.js')) return 'runtime';
        },
      },
    },
  },
});
