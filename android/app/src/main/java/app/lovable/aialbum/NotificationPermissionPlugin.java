//android/app/src/main/java/app/lovable/aialbum/NotificationPermissionPlugin.java


package app.lovable.aialbum;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
        name = "NotificationPermission",
        permissions = {
                @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
                @Permission(alias = "media", strings = {
                        Manifest.permission.READ_MEDIA_IMAGES,
                        Manifest.permission.READ_EXTERNAL_STORAGE
                })
        }
)
public class NotificationPermissionPlugin extends Plugin {

    private static final String TAG = "NotifPermPlugin";
    private static final String PREFS = "scripic_reminder_prefs";
    private static final String KEY_ENABLED = "reminders_enabled";

    @PluginMethod
    public void request(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        Context ctx = getContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("notifications", call, "notifCallback");
    }

    Callback
    private void notifCallback(PluginCall call) {
        PermissionState state = getPermissionState("notifications");
        JSObject r = new JSObject();
        r.put("granted", state == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void requestMedia(PluginCall call) {
        Context ctx = getContext();
        String perm = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? Manifest.permission.READ_MEDIA_IMAGES
                : Manifest.permission.READ_EXTERNAL_STORAGE;

        if (ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }

        requestPermissionForAlias("media", call, "mediaCallback");
    }

    @PermissionCallback
    private void mediaCallback(PluginCall call) {
        PermissionState state = getPermissionState("media");
        JSObject r = new JSObject();
        r.put("granted", state == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void setRemindersEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_ENABLED, enabled).apply();
        Log.d(TAG, "setRemindersEnabled=" + enabled);
        call.resolve();
    }

    @PluginMethod
    public void getPendingDeepLink(PluginCall call) {
        String p = MainActivity.pendingDeepLink;
        MainActivity.pendingDeepLink = null;
        JSObject r = new JSObject();
        if (p == null) {
            r.put("path", JSObject.NULL);
        } else {
            r.put("path", p);
        }
        call.resolve(r);
    }
}
