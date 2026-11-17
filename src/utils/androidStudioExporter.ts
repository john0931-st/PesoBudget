import JSZip from 'jszip';

interface BundleFileEntry {
  path: string;
  encoding: 'utf8' | 'base64';
  content: string;
}

interface AndroidBundlePayload {
  generatedAt: string;
  files: BundleFileEntry[];
}

const README_TXT = `PesoBudget - Android Studio Project Export
==========================================

How to build an installable Android APK in Android Studio:

1. Extract this ZIP file to a folder on your computer.
2. Open Android Studio -> File -> Open... and select the extracted "PesoBudget-AndroidStudio" folder.
3. Wait for Android Studio to finish Gradle Sync (requires internet once to download Gradle/AndroidX dependencies).
4. Build or install the APK:
   - Click Build -> Build Bundle(s) / APK(s) -> Build APK(s) to generate app-debug.apk
   - Or click Build -> Generate Signed Bundle / APK... for a signed release APK
   - Or connect an Android phone via USB and click Run (green play button).

Features bundled inside this APK:
- 100% offline-capable compiled web app inside app/src/main/assets/
- Served cleanly via AndroidX WebViewAssetLoader (no CORS errors, full localStorage persistence)
- Fullscreen layout, back-button navigation, and Android Downloads support for Excel (.xlsx) & JSON backups
- Adaptive launcher icons generated from PesoBudget app icons
`;

const SETTINGS_GRADLE = `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "PesoBudget"
include ':app'
`;

const ROOT_BUILD_GRADLE = `plugins {
    id 'com.android.application' version '8.5.2' apply false
}
`;

const GRADLE_PROPERTIES = `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
`;

const GRADLE_WRAPPER_PROPERTIES = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;

const APP_BUILD_GRADLE = `plugins {
    id 'com.android.application'
}

android {
    namespace 'com.pesobudget.tracker'
    compileSdk 34

    defaultConfig {
        applicationId "com.pesobudget.tracker"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.7.0'
    implementation 'androidx.webkit:webkit:1.11.0'
}
`;

const PROGUARD_RULES = `# Keep PesoBudget JavascriptInterface bridge methods
-keepclassmembers class com.pesobudget.tracker.MainActivity$DownloadBridge {
    @android.webkit.JavascriptInterface <methods>;
}
`;

const ANDROID_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission
        android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="28" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.PesoBudget"
        android:usesCleartextTraffic="false">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|keyboardHidden|keyboard|navigation"
            android:exported="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>
</manifest>
`;

const COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#0F172A</color>
    <color name="colorPrimaryDark">#0F172A</color>
    <color name="colorAccent">#059669</color>
</resources>
`;

const STRINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">PesoBudget</string>
</resources>
`;

const STYLES_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.PesoBudget" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
        <item name="android:statusBarColor">@color/colorPrimary</item>
        <item name="android:windowBackground">@android:color/white</item>
    </style>
</resources>
`;

const MAIN_ACTIVITY_JAVA = `package com.pesobudget.tracker;

import android.annotation.SuppressLint;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends AppCompatActivity {

    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        webView.addJavascriptInterface(new DownloadBridge(), "PesoAndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    @NonNull WebView view,
                    @NonNull WebResourceRequest request
            ) {
                Uri url = request.getUrl();
                WebResourceResponse assetResponse = assetLoader.shouldInterceptRequest(url);
                if (assetResponse != null) {
                    return assetResponse;
                }
                if (url.toString().startsWith(APP_ORIGIN)) {
                    // SPA navigation fallback to index.html for offline routes
                    return assetLoader.shouldInterceptRequest(Uri.parse(APP_ORIGIN + "/index.html"));
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    @NonNull WebView view,
                    @NonNull WebResourceRequest request
            ) {
                Uri url = request.getUrl();
                if (url.toString().startsWith(APP_ORIGIN)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectDownloadHelper(view);
            }
        });

        // Support blob: and data: downloads (Excel .xlsx and JSON backups) inside WebView
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url != null && url.startsWith("data:")) {
                saveDataUrl(url, mimeType, "pesobudget-export");
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        webView.loadUrl(APP_ORIGIN + "/index.html");
    }

    private void injectDownloadHelper(WebView view) {
        String js = "(function(){"
                + "if(window.__pesoDownloadPatched) return;"
                + "window.__pesoDownloadPatched = true;"
                + "document.addEventListener('click', function(e){"
                + "  var a = e.target && e.target.closest ? e.target.closest('a[download],a[href^=\"blob:\"],a[href^=\"data:\"]') : null;"
                + "  if(!a) return;"
                + "  var href = a.getAttribute('href') || '';"
                + "  var name = a.getAttribute('download') || 'pesobudget-export';"
                + "  if(href.startsWith('data:')){"
                + "    e.preventDefault();"
                + "    window.PesoAndroidBridge.saveBase64(href, name);"
                + "  } else if(href.startsWith('blob:')){"
                + "    e.preventDefault();"
                + "    fetch(href).then(function(r){return r.blob();}).then(function(b){"
                + "      var rd = new FileReader();"
                + "      rd.onloadend = function(){ window.PesoAndroidBridge.saveBase64(rd.result, name); };"
                + "      rd.readAsDataURL(b);"
                + "    });"
                + "  }"
                + "}, true);"
                + "})();";
        view.evaluateJavascript(js, null);
    }

    private void saveDataUrl(String dataUrl, String fallbackMime, String filename) {
        try {
            int commaIdx = dataUrl.indexOf(',');
            if (commaIdx < 0) return;
            String header = dataUrl.substring(5, commaIdx);
            String base64Part = dataUrl.substring(commaIdx + 1);
            String mime = header.split(";")[0];
            if (mime == null || mime.isEmpty()) {
                mime = fallbackMime != null ? fallbackMime : "application/octet-stream";
            }
            byte[] bytes = Base64.decode(base64Part, Base64.DEFAULT);
            saveBytesToDownloads(bytes, mime, filename);
        } catch (Exception e) {
            runOnUiThread(() ->
                    Toast.makeText(MainActivity.this, "Export failed: " + e.getMessage(), Toast.LENGTH_LONG).show()
            );
        }
    }

    private void saveBytesToDownloads(byte[] data, String mimeType, String filename) throws Exception {
        String safeName = (filename == null || filename.trim().isEmpty())
                ? "pesobudget-export"
                : filename.replaceAll("[^a-zA-Z0-9._-]", "_");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out != null) out.write(data);
                }
            }
        } else {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists()) dir.mkdirs();
            File outFile = new File(dir, safeName);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(data);
            }
        }

        runOnUiThread(() ->
                Toast.makeText(MainActivity.this, "Saved to Downloads/" + safeName, Toast.LENGTH_LONG).show()
        );
    }

    public class DownloadBridge {
        @JavascriptInterface
        public void saveBase64(String dataUrl, String filename) {
            saveDataUrl(dataUrl, "application/octet-stream", filename);
        }
    }
}
`;

export async function exportAndroidStudioProjectZip(): Promise<{ fileCount: number; filename: string }> {
  const response = await fetch('/android-studio-bundle.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load compiled app assets (HTTP ${response.status}).`);
  }

  const bundle = (await response.json()) as AndroidBundlePayload;
  if (!bundle.files || bundle.files.length === 0) {
    throw new Error('Compiled app bundle is empty.');
  }

  const zip = new JSZip();
  const root = zip.folder('PesoBudget-AndroidStudio');
  if (!root) {
    throw new Error('Failed to initialize ZIP archive.');
  }

  // 1. Root Gradle & documentation files
  root.file('README-ANDROID-STUDIO.txt', README_TXT);
  root.file('settings.gradle', SETTINGS_GRADLE);
  root.file('build.gradle', ROOT_BUILD_GRADLE);
  root.file('gradle.properties', GRADLE_PROPERTIES);
  root.file('gradle/wrapper/gradle-wrapper.properties', GRADLE_WRAPPER_PROPERTIES);

  // 2. Android App Module Gradle & Manifest
  root.file('app/build.gradle', APP_BUILD_GRADLE);
  root.file('app/proguard-rules.pro', PROGUARD_RULES);
  root.file('app/src/main/AndroidManifest.xml', ANDROID_MANIFEST);

  // 3. Android Resources
  root.file('app/src/main/res/values/colors.xml', COLORS_XML);
  root.file('app/src/main/res/values/strings.xml', STRINGS_XML);
  root.file('app/src/main/res/values/styles.xml', STYLES_XML);

  // 4. Launcher icons reused from compiled PWA icon PNGs
  const icon192 = bundle.files.find((f) => f.path === 'pwa-192x192.png');
  const icon512 = bundle.files.find((f) => f.path === 'pwa-512x512.png');
  if (icon192) {
    root.file('app/src/main/res/mipmap-hdpi/ic_launcher.png', icon192.content, { base64: true });
    root.file('app/src/main/res/mipmap-hdpi/ic_launcher_round.png', icon192.content, { base64: true });
  }
  if (icon512) {
    root.file('app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', icon512.content, { base64: true });
    root.file('app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', icon512.content, { base64: true });
  }

  // 5. Java Activity & Offline WebViewAssetLoader Bridge
  root.file('app/src/main/java/com/pesobudget/tracker/MainActivity.java', MAIN_ACTIVITY_JAVA);

  // 6. All compiled web app assets inside app/src/main/assets/
  for (const file of bundle.files) {
    if (file.encoding === 'base64') {
      root.file(`app/src/main/assets/${file.path}`, file.content, { base64: true });
    } else {
      root.file(`app/src/main/assets/${file.path}`, file.content);
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const filename = 'PesoBudget-AndroidStudio.zip';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return { fileCount: bundle.files.length, filename };
}
