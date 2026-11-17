import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {build, defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
import {
  computeSourceBuildId,
  resolveAutoReleaseState,
  type AutoReleaseEntry,
} from './scripts/autoRelease';

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.svg',
  '.json',
  '.webmanifest',
  '.txt',
  '.xml',
]);

interface BundleFileEntry {
  path: string;
  encoding: 'utf8' | 'base64';
  content: string;
}

function collectDistFiles(distDir: string, baseDir = distDir): BundleFileEntry[] {
  if (!fs.existsSync(distDir)) return [];
  const entries = fs.readdirSync(distDir, {withFileTypes: true});
  const result: BundleFileEntry[] = [];

  for (const entry of entries) {
    const fullPath = path.join(distDir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      result.push(...collectDistFiles(fullPath, baseDir));
      continue;
    }

    if (
      relPath === 'android-studio-bundle.json' ||
      relPath === 'portable-html-bundle.json' ||
      relPath === 'version.json' ||
      relPath === 'sw.js' ||
      relPath.startsWith('workbox-') ||
      relPath.endsWith('.map')
    ) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    const isText = TEXT_EXTENSIONS.has(ext);
    result.push({
      path: relPath,
      encoding: isText ? 'utf8' : 'base64',
      content: fs.readFileSync(fullPath, isText ? 'utf8' : 'base64'),
    });
  }

  return result;
}

function getLatestMtime(targetPath: string): number {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let max = stat.mtimeMs;
  for (const entry of fs.readdirSync(targetPath, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dev-dist') continue;
    const childMtime = getLatestMtime(path.join(targetPath, entry.name));
    if (childMtime > max) max = childMtime;
  }
  return max;
}

function androidStudioBundlePlugin(): Plugin {
  const distDir = path.resolve(__dirname, 'dist');
  const bundlePath = path.join(distDir, 'android-studio-bundle.json');

  const writeBundleJson = () => {
    const files = collectDistFiles(distDir);
    if (files.length === 0) return null;
    const payload = JSON.stringify({
      generatedAt: new Date().toISOString(),
      files,
    });
    fs.writeFileSync(bundlePath, payload, 'utf8');
    return payload;
  };

  return {
    name: 'pesobudget-android-studio-bundle',
    closeBundle() {
      if (process.env.PESO_BUILDING_ANDROID_BUNDLE === '1') return;
      writeBundleJson();
    },
    configureServer(server) {
      server.middlewares.use('/android-studio-bundle.json', async (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const bundleMtime = fs.existsSync(bundlePath) ? fs.statSync(bundlePath).mtimeMs : 0;
          const srcMtime = Math.max(
            getLatestMtime(path.resolve(__dirname, 'src')),
            getLatestMtime(path.resolve(__dirname, 'index.html')),
            getLatestMtime(path.resolve(__dirname, 'public'))
          );

          let payload: string | null = null;
          if (bundleMtime > srcMtime && bundleMtime > 0) {
            payload = fs.readFileSync(bundlePath, 'utf8');
          } else {
            process.env.PESO_BUILDING_ANDROID_BUNDLE = '1';
            try {
              await build({
                configFile: path.resolve(__dirname, 'vite.config.ts'),
                logLevel: 'silent',
              });
            } finally {
              delete process.env.PESO_BUILDING_ANDROID_BUNDLE;
            }
            payload = writeBundleJson();
          }

          if (!payload) {
            res.statusCode = 500;
            res.end(JSON.stringify({error: 'Compiled dist bundle unavailable'}));
            return;
          }

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(payload);
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({error: err instanceof Error ? err.message : 'Bundle build failed'}));
        }
      });
    },
  };
}

function virtualPwaStubPlugin(): Plugin {
  const virtualId = 'virtual:pwa-register';
  const resolvedVirtualId = '\0' + virtualId;
  return {
    name: 'pesobudget-virtual-pwa-stub',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
      return null;
    },
    load(id) {
      if (id === resolvedVirtualId) {
        return 'export function registerSW() { return function() {}; }';
      }
      return null;
    },
  };
}

function buildPortablePayload(publicDir: string, portableDistDir: string): string | null {
  const assetsDir = path.join(portableDistDir, 'assets');
  if (!fs.existsSync(assetsDir)) return null;

  const assetFiles = fs.readdirSync(assetsDir);
  const cssFile = assetFiles.find((f) => f.endsWith('.css'));
  const jsFile = assetFiles.find((f) => f.endsWith('.js'));
  if (!cssFile || !jsFile) return null;

  const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
  const js = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');

  const iconNames = [
    'icon.svg',
    'apple-touch-icon.png',
    'pwa-192x192.png',
    'pwa-512x512.png',
    'pwa-maskable-512x512.png',
  ];
  const icons: BundleFileEntry[] = [];
  for (const name of iconNames) {
    const iconPath = path.join(publicDir, name);
    if (!fs.existsSync(iconPath)) continue;
    const isText = name.endsWith('.svg');
    icons.push({
      path: name,
      encoding: isText ? 'utf8' : 'base64',
      content: fs.readFileSync(iconPath, isText ? 'utf8' : 'base64'),
    });
  }

  let manifestJson = JSON.stringify(
    {
      name: 'PesoBudget - Smart Expense & Payroll Tracker',
      short_name: 'PesoBudget',
      start_url: '../index.html',
      display: 'standalone',
      theme_color: '#0f172a',
      background_color: '#ffffff',
      icons: [
        { src: './icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: './icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: './icons/icon.svg', sizes: '512x512', type: 'image/svg+xml' },
      ],
    },
    null,
    2
  );
  const publicManifest = path.join(publicDir, 'manifest.json');
  if (fs.existsSync(publicManifest)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(publicManifest, 'utf8'));
      parsed.start_url = '../index.html';
      parsed.scope = '../';
      if (Array.isArray(parsed.icons)) {
        parsed.icons = parsed.icons.map((ic: { src?: string }) => ({
          ...ic,
          src: typeof ic.src === 'string' ? `./icons/${path.basename(ic.src)}` : ic.src,
        }));
      }
      manifestJson = JSON.stringify(parsed, null, 2);
    } catch {
      // keep default manifest
    }
  }

  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    css,
    js,
    manifestJson,
    icons,
  });
}

function portableHtmlBundlePlugin(): Plugin {
  const distDir = path.resolve(__dirname, 'dist');
  const portableDistDir = path.resolve(__dirname, 'dist-portable');
  const publicDir = path.resolve(__dirname, 'public');
  const bundlePath = path.join(distDir, 'portable-html-bundle.json');

  const generatePortableBundle = async (): Promise<string | null> => {
    process.env.PESO_BUILDING_PORTABLE_BUNDLE = '1';
    try {
      await build({
        configFile: path.resolve(__dirname, 'vite.config.ts'),
        logLevel: 'silent',
      });
      const payload = buildPortablePayload(publicDir, portableDistDir);
      if (payload) {
        if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
        fs.writeFileSync(bundlePath, payload, 'utf8');
      }
      return payload;
    } finally {
      delete process.env.PESO_BUILDING_PORTABLE_BUNDLE;
      fs.rmSync(portableDistDir, { recursive: true, force: true });
    }
  };

  return {
    name: 'pesobudget-portable-html-bundle',
    async closeBundle() {
      if (
        process.env.PESO_BUILDING_ANDROID_BUNDLE === '1' ||
        process.env.PESO_BUILDING_PORTABLE_BUNDLE === '1'
      ) {
        return;
      }
      await generatePortableBundle();
    },
    configureServer(server) {
      server.middlewares.use('/portable-html-bundle.json', async (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const bundleMtime = fs.existsSync(bundlePath) ? fs.statSync(bundlePath).mtimeMs : 0;
          const srcMtime = Math.max(
            getLatestMtime(path.resolve(__dirname, 'src')),
            getLatestMtime(path.resolve(__dirname, 'index.html')),
            getLatestMtime(publicDir)
          );

          let payload: string | null = null;
          if (bundleMtime > srcMtime && bundleMtime > 0) {
            payload = fs.readFileSync(bundlePath, 'utf8');
          } else {
            payload = await generatePortableBundle();
          }

          if (!payload) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Portable HTML bundle unavailable' }));
            return;
          }

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(payload);
        } catch (err) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({ error: err instanceof Error ? err.message : 'Portable build failed' })
          );
        }
      });
    },
  };
}

function releaseManifestPlugin(
  latest: AutoReleaseEntry,
  history: AutoReleaseEntry[]
): Plugin {
  const distDir = path.resolve(__dirname, 'dist');
  const manifestPath = path.join(distDir, 'version.json');

  return {
    name: 'pesobudget-release-manifest',
    closeBundle() {
      if (
        process.env.PESO_BUILDING_ANDROID_BUNDLE === '1' ||
        process.env.PESO_BUILDING_PORTABLE_BUNDLE === '1'
      ) {
        return;
      }
      if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            ...latest,
            history,
          },
          null,
          2
        ),
        'utf8'
      );
    },
    configureServer(server) {
      server.middlewares.use('/version.json', (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        const liveBuildId = computeSourceBuildId(__dirname);
        const liveReleaseState = resolveAutoReleaseState(
          __dirname,
          liveBuildId,
          new Date().toISOString(),
          { persist: true }
        );
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify(
            {
              ...liveReleaseState.latest,
              history: liveReleaseState.history,
            },
            null,
            2
          )
        );
      });
    },
  };
}

export default defineConfig(() => {
  const buildId = computeSourceBuildId(__dirname);
  const nowIso = new Date().toISOString();
  const isSubBuild =
    process.env.PESO_BUILDING_ANDROID_BUNDLE === '1' ||
    process.env.PESO_BUILDING_PORTABLE_BUNDLE === '1';

  const { latest, history } = resolveAutoReleaseState(__dirname, buildId, nowIso, {
    persist: !isSubBuild,
  });

  if (process.env.PESO_BUILDING_PORTABLE_BUNDLE === '1') {
    return {
      define: {
        __PESOBUDGET_BUILD_ID__: JSON.stringify(latest.buildId),
        __PESOBUDGET_BUILD_TIME__: JSON.stringify(latest.buildTime),
        __PESOBUDGET_RELEASE_HISTORY__: JSON.stringify(history),
      },
      plugins: [react(), tailwindcss(), virtualPwaStubPlugin()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },
      build: {
        outDir: 'dist-portable',
        emptyOutDir: true,
        cssCodeSplit: false,
        rollupOptions: {
          output: {
            format: 'iife' as const,
            name: 'PesoBudgetApp',
            inlineDynamicImports: true,
          },
        },
      },
    };
  }

  return {
    define: {
      __PESOBUDGET_BUILD_ID__: JSON.stringify(latest.buildId),
      __PESOBUDGET_BUILD_TIME__: JSON.stringify(latest.buildTime),
      __PESOBUDGET_RELEASE_HISTORY__: JSON.stringify(history),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'PesoBudget - Smart Expense & Payroll Tracker',
          short_name: 'PesoBudget',
          description: 'Philippine Peso Salary and Expense Monitoring Spreadsheet with Metrobank and QR PH Auto Computations',
          theme_color: '#0f172a',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest,json}'],
          globIgnores: ['**/android-studio-bundle.json', '**/portable-html-bundle.json', '**/version.json'],
          navigateFallback: '/index.html',
          navigateFallbackAllowlist: [/.*/],
          navigateFallbackDenylist: [/^\/api\//],
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ url, request }: { url: URL; request: Request }) =>
                request.method === 'GET' &&
                url.origin === self.location.origin &&
                !url.pathname.startsWith('/api/') &&
                url.pathname !== '/version.json' &&
                url.pathname !== '/android-studio-bundle.json' &&
                url.pathname !== '/portable-html-bundle.json',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pesobudget-app-runtime-v28',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      androidStudioBundlePlugin(),
      portableHtmlBundlePlugin(),
      releaseManifestPlugin(latest, history),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
