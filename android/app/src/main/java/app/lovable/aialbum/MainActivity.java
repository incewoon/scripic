// android/app/src/main/java/app/lovable/aialbum/MainActivity.java

package app.lovable.aialbum;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.BridgeActivity;

import com.google.firebase.FirebaseApp;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;

import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {

    /** Set by MainActivity when a notification tap delivers a "deepLink" extra.
     *  Read (and cleared) by NotificationPermissionPlugin.getPendingDeepLink()
     *  once the web layer is ready. */
    public static volatile String pendingDeepLink = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppCheckPlugin.class);
        registerPlugin(ScripicSTTPlugin.class);
        registerPlugin(NotificationPermissionPlugin.class);
        super.onCreate(savedInstanceState);

        // Edge-to-edge: let the WebView extend behind status & navigation bars,
        // and expose safe-area insets to CSS via env(safe-area-inset-*).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        // Firebase App Check (Play Integrity)
        FirebaseApp.initializeApp(this);
        FirebaseAppCheck firebaseAppCheck = FirebaseAppCheck.getInstance();
        firebaseAppCheck.installAppCheckProviderFactory(
                PlayIntegrityAppCheckProviderFactory.getInstance()
        );

        // Schedule the periodic photo reminder check (KEEP = no duplicates).
        PeriodicWorkRequest req =
                new PeriodicWorkRequest.Builder(PhotoReminderWorker.class, 1, TimeUnit.HOURS).build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "photo_reminder_check", ExistingPeriodicWorkPolicy.KEEP, req);

        handleDeepLinkIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLinkIntent(intent);
    
        // 웜 리줌(앱이 이미 실행 중일 때) 즉시 처리
        String deepLink = intent.getStringExtra("deepLink");
        if (deepLink != null && bridge != null && bridge.getWebView() != null) {
            String safe = deepLink.replace("'", "\\'");
            bridge.getWebView().post(() ->
                bridge.eval("window.__scripicHandleDeepLink && window.__scripicHandleDeepLink('" + safe + "');", null)
            );
        }
    }

    private void handleDeepLinkIntent(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra("deepLink");
        if (path != null && !path.isEmpty()) {
            pendingDeepLink = path;
        }
    }
}
