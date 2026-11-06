import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'media-cors-proxy',
        configureServer(server) {
          server.middlewares.use('/api/media-proxy', async (req, res) => {
            try {
              const urlParam = new URL(req.url || '', 'http://localhost').searchParams.get('url');
              if (!urlParam) {
                res.statusCode = 400;
                res.end('Missing url');
                return;
              }
              const parsed = new URL(urlParam);
              if (!parsed.hostname.endsWith('firebasestorage.googleapis.com') && !parsed.hostname.endsWith('storage.googleapis.com')) {
                res.statusCode = 403;
                res.end('Forbidden host');
                return;
              }
              const response = await fetch(urlParam);
              if (!response.ok) {
                res.statusCode = response.status;
                res.end(`Upstream error: ${response.statusText}`);
                return;
              }
              res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
              res.setHeader('Access-Control-Allow-Origin', '*');
              const buffer = Buffer.from(await response.arrayBuffer());
              res.end(buffer);
            } catch (err: any) {
              res.statusCode = 500;
              res.end(err?.message || 'Proxy error');
            }
          });
        },
        configurePreviewServer(server) {
          server.middlewares.use('/api/media-proxy', async (req, res) => {
            try {
              const urlParam = new URL(req.url || '', 'http://localhost').searchParams.get('url');
              if (!urlParam) {
                res.statusCode = 400;
                res.end('Missing url');
                return;
              }
              const parsed = new URL(urlParam);
              if (!parsed.hostname.endsWith('firebasestorage.googleapis.com') && !parsed.hostname.endsWith('storage.googleapis.com')) {
                res.statusCode = 403;
                res.end('Forbidden host');
                return;
              }
              const response = await fetch(urlParam);
              if (!response.ok) {
                res.statusCode = response.status;
                res.end(`Upstream error: ${response.statusText}`);
                return;
              }
              res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
              res.setHeader('Access-Control-Allow-Origin', '*');
              const buffer = Buffer.from(await response.arrayBuffer());
              res.end(buffer);
            } catch (err: any) {
              res.statusCode = 500;
              res.end(err?.message || 'Proxy error');
            }
          });
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'favicon.png',
          'apple-touch-icon.png',
          'icon.svg',
          'icons/favicon.ico',
          'icons/favicon-32.png',
          'icons/apple-touch-icon-180.png',
          'icons/icon-192.png',
          'icons/icon-512.png',
        ],
        manifest: {
          id: './',
          name: 'Hala — Middle East Chat',
          short_name: 'Hala',
          description: 'Hala mobile-first Middle East chat experience.',
          theme_color: '#087F75',
          background_color: '#087F75',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: './',
          scope: './',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/maskable-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/monochrome-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'monochrome',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR === 'true' ? false : { overlay: false },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          welcome: path.resolve(__dirname, 'welcome.html'),
        },
      },
    },
  };
});
