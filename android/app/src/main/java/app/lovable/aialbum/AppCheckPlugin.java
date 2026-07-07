package app.lovable.aialbum;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.appcheck.FirebaseAppCheck;

/**
 * Bridge for the web layer to fetch a Firebase App Check token from the
 * native Play Integrity provider. The provider itself is installed once in
 * MainActivity.onCreate() — this plugin only exposes getToken().
 */
@CapacitorPlugin(name = "AppCheckBridge")
public class AppCheckPlugin extends Plugin {

    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseAppCheck.getInstance()
            .getAppCheckToken(false)
            .addOnSuccessListener(res -> {
                JSObject ret = new JSObject();
                ret.put("token", res.getToken());
                ret.put("expireTimeMillis", res.getExpireTimeMillis());
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.reject("app_check_failed", e));
    }
}
