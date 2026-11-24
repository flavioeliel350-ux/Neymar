const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PREFERRED_PORT = 41735;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

let mainWindow = null;
let localServer = null;
let updateDownloadActive = false;

function isAllowedGitHubDownloadUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'github.com' ||
      host.endsWith('.github.com') ||
      host === 'githubusercontent.com' ||
      host.endsWith('.githubusercontent.com')
    );
  } catch {
    return false;
  }
}

function sendUpdateProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('prontopreco:update-progress', payload);
  }
}

function downloadFileWithRedirects(targetUrl, destPartPath, onProgress, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    if (!isAllowedGitHubDownloadUrl(targetUrl)) {
      reject(new Error('URL de atualização não autorizada.'));
      return;
    }

    const req = https.get(
      targetUrl,
      {
        headers: {
          'User-Agent': 'ProntoPreco-DesktopUpdater',
        },
        timeout: 30000,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (
          (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) &&
          res.headers.location
        ) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error('Excesso de redirecionamentos ao baixar atualização.'));
            return;
          }
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          downloadFileWithRedirects(nextUrl, destPartPath, onProgress, redirectsLeft - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Falha ao baixar atualização (HTTP ${status}).`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10) || 0;
        let receivedBytes = 0;
        let lastReportMs = 0;

        const outStream = fs.createWriteStream(destPartPath);

        res.on('data', (chunk) => {
          receivedBytes += chunk.length;
          const now = Date.now();
          if (now - lastReportMs >= 150) {
            lastReportMs = now;
            const percent =
              totalBytes > 0 ? Math.min(99, Math.round((receivedBytes * 100) / totalBytes)) : 0;
            onProgress({ receivedBytes, totalBytes, percent });
          }
        });

        res.pipe(outStream);

        outStream.on('finish', () => {
          outStream.close(() => resolve({ receivedBytes, totalBytes }));
        });

        outStream.on('error', (err) => {
          fs.rmSync(destPartPath, { force: true });
          reject(err);
        });

        res.on('error', (err) => {
          outStream.destroy();
          fs.rmSync(destPartPath, { force: true });
          reject(err);
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('Tempo limite excedido durante o download da atualização.'));
    });

    req.on('error', (err) => {
      fs.rmSync(destPartPath, { force: true });
      reject(err);
    });
  });
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      const safeRelPath = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
      const targetPath = path.resolve(DIST_DIR, '.' + safeRelPath);

      if (!targetPath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let fileToServe = targetPath;
      if (!fs.existsSync(fileToServe) || fs.statSync(fileToServe).isDirectory()) {
        fileToServe = path.join(DIST_DIR, 'index.html');
      }

      const ext = path.extname(fileToServe).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(fileToServe, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Internal Error');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        server.listen(0, '127.0.0.1');
      } else {
        reject(err);
      }
    });

    server.on('listening', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : PREFERRED_PORT;
      resolve({ server, port });
    });

    server.listen(PREFERRED_PORT, '127.0.0.1');
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    title: 'ProntoPreço — Balcão & Estoque',
    backgroundColor: '#faf8ff',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isAuthPopup =
      url.startsWith('https://accounts.google.com') ||
      url.startsWith('https://groovy-heading-9w1rw.firebaseapp.com') ||
      url.includes('/__/auth/') ||
      url.startsWith(`http://localhost:${port}`);

    if (isAuthPopup) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.prontopreco.desktop');
    }

    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        if (permission === 'media') {
          callback(true);
          return;
        }
        callback(false);
      },
    );

    ipcMain.handle('prontopreco:get-env', () => ({
      isDesktop: true,
      platform: process.platform,
      isPortable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
      version: app.getVersion(),
    }));

    ipcMain.handle('prontopreco:install-update', async (_event, payload) => {
      if (updateDownloadActive) {
        return { ok: false, message: 'Já existe um download de atualização em andamento.' };
      }

      const rawUrl = payload && typeof payload.url === 'string' ? payload.url : '';
      const rawName = payload && typeof payload.fileName === 'string' ? payload.fileName : '';

      if (!isAllowedGitHubDownloadUrl(rawUrl)) {
        const msg = 'Endereço de download inválido.';
        sendUpdateProgress({ stage: 'error', percent: 0, message: msg });
        return { ok: false, message: msg };
      }

      const safeBaseName = path
        .basename(rawName || 'ProntoPreco-Update.exe')
        .replace(/[^a-zA-Z0-9._-]/g, '_');

      if (!safeBaseName.toLowerCase().endsWith('.exe')) {
        const msg = 'Formato de instalador incompatível para atualização automática no Windows.';
        sendUpdateProgress({ stage: 'error', percent: 0, message: msg });
        return { ok: false, message: msg };
      }

      updateDownloadActive = true;
      const destPath = path.join(app.getPath('temp'), safeBaseName);
      const partPath = `${destPath}.part`;

      try {
        sendUpdateProgress({
          stage: 'downloading',
          percent: 0,
          receivedBytes: 0,
          totalBytes: 0,
          message: `Baixando ${safeBaseName}...`,
        });

        const { receivedBytes, totalBytes } = await downloadFileWithRedirects(
          rawUrl,
          partPath,
          ({ receivedBytes: r, totalBytes: t, percent }) => {
            sendUpdateProgress({
              stage: 'downloading',
              percent,
              receivedBytes: r,
              totalBytes: t,
              message: `Baixando ${safeBaseName}...`,
            });
          },
        );

        if (fs.existsSync(destPath)) {
          fs.rmSync(destPath, { force: true });
        }
        fs.renameSync(partPath, destPath);

        const stats = fs.statSync(destPath);
        if (stats.size < 500000) {
          throw new Error('O arquivo baixado parece corrompido ou incompleto.');
        }

        // Verify Windows PE executable signature ("MZ")
        const headerFd = fs.openSync(destPath, 'r');
        const magicBuf = Buffer.alloc(2);
        try {
          fs.readSync(headerFd, magicBuf, 0, 2, 0);
        } finally {
          fs.closeSync(headerFd);
        }
        if (magicBuf[0] !== 0x4d || magicBuf[1] !== 0x5a) {
          throw new Error('O arquivo baixado não é um executável Windows válido (.exe).');
        }

        const portableTarget = process.env.PORTABLE_EXECUTABLE_FILE;
        if (portableTarget && safeBaseName.toLowerCase().includes('portatil')) {
          sendUpdateProgress({
            stage: 'installing',
            percent: 100,
            receivedBytes: stats.size,
            totalBytes: totalBytes || receivedBytes || stats.size,
            message: 'Aplicando atualização no executável portátil e reiniciando...',
          });

          const batPath = path.join(app.getPath('temp'), `prontopreco-update-${Date.now()}.cmd`);
          const escapedNew = destPath.replace(/"/g, '""');
          const escapedTarget = portableTarget.replace(/"/g, '""');
          const scriptLines = [
            '@echo off',
            'setlocal',
            'timeout /t 2 /nobreak >nul',
            'set RETRIES=0',
            ':copy_loop',
            `copy /Y "${escapedNew}" "${escapedTarget}" >nul 2>&1`,
            'if %errorlevel%==0 goto launch_app',
            'set /a RETRIES+=1',
            'if %RETRIES% GEQ 12 goto launch_fallback',
            'timeout /t 1 /nobreak >nul',
            'goto copy_loop',
            ':launch_app',
            `del /Q "${escapedNew}" >nul 2>&1`,
            `start "" "${escapedTarget}"`,
            'goto cleanup',
            ':launch_fallback',
            `start "" "${escapedNew}"`,
            ':cleanup',
            'del "%~f0" >nul 2>&1',
          ].join('\r\n');
          fs.writeFileSync(batPath, scriptLines, 'utf8');

          const updaterProc = spawn('cmd.exe', ['/c', batPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          });
          updaterProc.unref();

          setTimeout(() => {
            app.quit();
          }, 500);

          return { ok: true };
        }

        sendUpdateProgress({
          stage: 'installing',
          percent: 100,
          receivedBytes: stats.size,
          totalBytes: totalBytes || receivedBytes || stats.size,
          message: 'Download concluído! Abrindo instalador e encerrando o ProntoPreço...',
        });

        const openErr = await shell.openPath(destPath);
        if (openErr) {
          throw new Error(`Não foi possível abrir o instalador: ${openErr}`);
        }

        setTimeout(() => {
          app.quit();
        }, 650);

        return { ok: true };
      } catch (err) {
        fs.rmSync(partPath, { force: true });
        const msg =
          err instanceof Error
            ? err.message
            : 'Falha ao baixar ou iniciar a atualização.';
        sendUpdateProgress({ stage: 'error', percent: 0, message: msg });
        return { ok: false, message: msg };
      } finally {
        updateDownloadActive = false;
      }
    });

    const { server, port } = await startStaticServer();
    localServer = server;
    createWindow(port);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(port);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (localServer) {
      localServer.close();
      localServer = null;
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
