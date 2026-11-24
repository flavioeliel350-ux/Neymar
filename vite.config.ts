import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
      {
        name: 'prontopreco-version-manifest',
        configureServer(server) {
          server.middlewares.use('/version.json', (_req, res) => {
            try {
              const pkgPath = path.resolve(__dirname, 'package.json');
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
                name?: string;
                version?: string;
              };
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store');
              res.end(
                JSON.stringify({
                  name: pkg.name || 'prontopreco',
                  version: pkg.version || '1.0.0',
                  builtAt: new Date().toISOString(),
                }),
              );
            } catch {
              res.statusCode = 500;
              res.end('{}');
            }
          });
        },
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const pkgPath = path.resolve(__dirname, 'package.json');
          if (!fs.existsSync(distDir) || !fs.existsSync(pkgPath)) return;
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
            name?: string;
            version?: string;
          };
          const payload = JSON.stringify(
            {
              name: pkg.name || 'prontopreco',
              version: pkg.version || '1.0.0',
              builtAt: new Date().toISOString(),
            },
            null,
            2,
          );
          fs.writeFileSync(path.join(distDir, 'version.json'), `${payload}\n`, 'utf-8');
        },
      },
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
