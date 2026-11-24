package com.prontopreco.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "ProntoPrecoUpdater")
public class ProntoPrecoUpdaterPlugin extends Plugin {
    private static final String UPDATE_APK_FILENAME = "prontopreco-update.apk";
    private final AtomicBoolean isDownloadingUpdate = new AtomicBoolean(false);
    private volatile boolean pendingPermissionInstall = false;

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (!pendingPermissionInstall) {
            return;
        }
        Context context = getContext();
        if (context == null) {
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.getPackageManager().canRequestPackageInstalls()) {
            pendingPermissionInstall = false;
            File apkFile = new File(context.getCacheDir(), UPDATE_APK_FILENAME);
            if (apkFile.exists() && isValidApkArchive(apkFile)) {
                launchApkInstaller(apkFile);
            }
        }
    }

    private boolean isValidApkArchive(File file) {
        if (file == null || !file.exists() || file.length() < 100000L) {
            return false;
        }
        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) {
            int b0 = fis.read();
            int b1 = fis.read();
            return b0 == 0x50 && b1 == 0x4B; // "PK" ZIP/APK header
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isAllowedDownloadUrl(String rawUrl) {
        if (rawUrl == null) return false;
        try {
            Uri uri = Uri.parse(rawUrl.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null) return false;
            if (!"https".equalsIgnoreCase(scheme)) return false;
            String lowerHost = host.toLowerCase();
            return "github.com".equals(lowerHost)
                || lowerHost.endsWith(".github.com")
                || "githubusercontent.com".equals(lowerHost)
                || lowerHost.endsWith(".githubusercontent.com");
        } catch (Exception ignored) {
            return false;
        }
    }

    private void emitProgress(
        String stage,
        int percent,
        long receivedBytes,
        long totalBytes,
        String message
    ) {
        JSObject payload = new JSObject();
        payload.put("stage", stage);
        payload.put("percent", percent);
        payload.put("receivedBytes", receivedBytes);
        payload.put("totalBytes", totalBytes);
        if (message != null) {
            payload.put("message", message);
        }
        notifyListeners("updateProgress", payload);
    }

    private void launchApkInstaller(File apkFile) {
        Context context = getContext();
        if (context == null || !isValidApkArchive(apkFile)) {
            pendingPermissionInstall = false;
            emitProgress("error", 0, 0, 0, "Arquivo APK inválido ou incompleto.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            pendingPermissionInstall = true;
            emitProgress(
                "needs_permission",
                100,
                apkFile.length(),
                apkFile.length(),
                "Autorize o ProntoPreço a instalar atualizações nas configurações do Android. Ao voltar para o app, a instalação abrirá automaticamente."
            );
            return;
        }

        pendingPermissionInstall = false;
        try {
            Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            emitProgress(
                "installer_launched",
                100,
                apkFile.length(),
                apkFile.length(),
                "Instalador do Android aberto. Confirme na tela para concluir a atualização."
            );
        } catch (Exception e) {
            emitProgress("error", 0, 0, 0, "Não foi possível iniciar o instalador do Android.");
        }
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        Context context = getContext();
        boolean allowed = true;
        if (context != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = context.getPackageManager().canRequestPackageInstalls();
        }
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        Context context = getContext();
        if (context != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                call.resolve();
                return;
            } catch (Exception ignored) {
                emitProgress(
                    "error",
                    0,
                    0,
                    0,
                    "Abra Configurações > Aplicativos > Acesso especial > Instalar apps desconhecidos."
                );
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void installDownloadedApk(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Contexto indisponível.");
            return;
        }
        File apkFile = new File(context.getCacheDir(), UPDATE_APK_FILENAME);
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> launchApkInstaller(apkFile));
        } else {
            launchApkInstaller(apkFile);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        final String apkUrl = call.getString("url", "");
        final String fileName = call.getString("fileName", "ProntoPreco.apk");

        if (!isAllowedDownloadUrl(apkUrl)) {
            emitProgress("error", 0, 0, 0, "Endereço de atualização não autorizado.");
            call.reject("Invalid update URL");
            return;
        }

        if (!isDownloadingUpdate.compareAndSet(false, true)) {
            call.resolve();
            return;
        }

        Context context = getContext();
        if (context == null) {
            isDownloadingUpdate.set(false);
            call.reject("Context unavailable");
            return;
        }

        call.resolve();
        emitProgress(
            "downloading",
            0,
            0,
            0,
            "Conectando ao GitHub para baixar " + fileName + "..."
        );

        final File cacheDir = context.getCacheDir();
        new Thread(() -> {
            File tempFile = new File(cacheDir, UPDATE_APK_FILENAME + ".part");
            File finalFile = new File(cacheDir, UPDATE_APK_FILENAME);
            HttpURLConnection conn = null;

            try {
                String currentUrl = apkUrl.trim();
                int redirects = 0;

                while (redirects < 6) {
                    if (!isAllowedDownloadUrl(currentUrl)) {
                        throw new SecurityException("Invalid redirect domain");
                    }
                    URL url = new URL(currentUrl);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setRequestProperty("User-Agent", "ProntoPreco-AndroidUpdater");

                    int code = conn.getResponseCode();
                    if (code == HttpURLConnection.HTTP_MOVED_TEMP
                        || code == HttpURLConnection.HTTP_MOVED_PERM
                        || code == HttpURLConnection.HTTP_SEE_OTHER
                        || code == 307
                        || code == 308) {
                        String nextUrl = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (nextUrl == null || nextUrl.isEmpty()) {
                            throw new IllegalStateException("Invalid redirect location");
                        }
                        currentUrl = new URL(url, nextUrl).toString();
                        redirects++;
                        continue;
                    }
                    break;
                }

                if (conn == null || conn.getResponseCode() < 200 || conn.getResponseCode() >= 300) {
                    throw new IllegalStateException("HTTP download failed");
                }

                long totalBytes = conn.getContentLengthLong();
                long receivedBytes = 0;
                long lastEmitMs = 0;

                if (tempFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    tempFile.delete();
                }

                try (
                    InputStream input = new BufferedInputStream(conn.getInputStream());
                    FileOutputStream output = new FileOutputStream(tempFile)
                ) {
                    byte[] buffer = new byte[16384];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        receivedBytes += count;

                        long now = System.currentTimeMillis();
                        if (now - lastEmitMs >= 180) {
                            lastEmitMs = now;
                            int pct = totalBytes > 0
                                ? (int) Math.min(99, (receivedBytes * 100L) / totalBytes)
                                : (int) Math.min(90, Math.max(5, receivedBytes / (256L * 1024L)));
                            emitProgress(
                                "downloading",
                                pct,
                                receivedBytes,
                                totalBytes,
                                "Baixando atualização dentro do app..."
                            );
                        }
                    }
                    output.flush();
                }

                if (finalFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    finalFile.delete();
                }
                if (!tempFile.renameTo(finalFile)) {
                    throw new IllegalStateException("Failed to rename APK");
                }
                if (!isValidApkArchive(finalFile)) {
                    //noinspection ResultOfMethodCallIgnored
                    finalFile.delete();
                    throw new IllegalStateException("Downloaded file is not a valid APK");
                }

                final long finalSize = finalFile.length();
                emitProgress(
                    "installing",
                    100,
                    finalSize,
                    totalBytes > 0 ? totalBytes : finalSize,
                    "Download concluído! Abrindo instalador..."
                );

                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> launchApkInstaller(finalFile));
                } else {
                    launchApkInstaller(finalFile);
                }
            } catch (Exception e) {
                if (tempFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    tempFile.delete();
                }
                emitProgress(
                    "error",
                    0,
                    0,
                    0,
                    "Falha ao baixar atualização. Verifique a conexão e tente novamente."
                );
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
                isDownloadingUpdate.set(false);
            }
        }).start();
    }
}
