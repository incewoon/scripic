//android/app/src/main/java/app/lovable/aialbum/ScripicSTTPlugin.java

package app.lovable.aialbum;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
        name = "ScripicSTT",
        permissions = {
                @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
        }
)
public class ScripicSTTPlugin extends Plugin {

    private static final String TAG = "ScripicSTT";
    private static final long FORCE_KILL_TIMEOUT_MS = 1200;
    private static final long BUSY_RECHECK_DELAY_MS = 150;

    private enum State { IDLE, STARTING, LISTENING, STOPPING }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile State state = State.IDLE;
    private SpeechRecognizer recognizer = null;
    private Runnable forceKillRunnable = null;
    private boolean partialResultsEnabled = true;

    // ---------- Helpers ----------

    private void logThread(String where) {
        Log.d(TAG, where + " on thread: " + Thread.currentThread().getName() + " state=" + state);
    }

    private void runOnMain(Runnable r) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            r.run();
        } else {
            mainHandler.post(r);
        }
    }

    private void cancelForceKill() {
        if (forceKillRunnable != null) {
            mainHandler.removeCallbacks(forceKillRunnable);
            forceKillRunnable = null;
        }
    }

    private void scheduleForceKill() {
        cancelForceKill();
        forceKillRunnable = () -> {
            Log.w(TAG, "forceKill fired — recognizer did not respond within " + FORCE_KILL_TIMEOUT_MS + "ms");
            forceKillRunnable = null;
            forceDestroy();
            emitStopped();
        };
        mainHandler.postDelayed(forceKillRunnable, FORCE_KILL_TIMEOUT_MS);
    }

    // Must be called on main thread.
    private void forceDestroy() {
        logThread("forceDestroy()");
        cancelForceKill();
        if (recognizer != null) {
            try {
                recognizer.setRecognitionListener(null);
                recognizer.cancel();
            } catch (Throwable t) {
                Log.w(TAG, "forceDestroy cancel threw", t);
            }
            try {
                recognizer.destroy();
            } catch (Throwable t) {
                Log.w(TAG, "forceDestroy destroy threw", t);
            }
            recognizer = null;
        }
        state = State.IDLE;
    }

    private void destroyAndReset() {
        runOnMain(() -> {
            logThread("destroyAndReset()");
            cancelForceKill();
            if (recognizer != null) {
                try {
                    recognizer.setRecognitionListener(null);
                } catch (Throwable ignored) {}
                try {
                    recognizer.destroy();
                } catch (Throwable t) {
                    Log.w(TAG, "destroy threw", t);
                }
                recognizer = null;
            }
            state = State.IDLE;
            Log.d(TAG, "destroyAndReset() completed, ts=" + System.currentTimeMillis());
        });
    }

    private void emitStarted() {
        JSObject o = new JSObject();
        o.put("status", "started");
        notifyListeners("listeningState", o);
    }

    private void emitStopped() {
        JSObject o = new JSObject();
        o.put("status", "stopped");
        notifyListeners("listeningState", o);
    }

    private void emitPartial(ArrayList<String> matches) {
        if (matches == null || matches.isEmpty()) return;
        JSObject o = new JSObject();
        o.put("matches", new org.json.JSONArray(matches));
        notifyListeners("partialResults", o);
    }

    private void emitError(int code, String message) {
        JSObject o = new JSObject();
        o.put("code", code);
        o.put("message", message);
        notifyListeners("error", o);
    }

    private String errorMessage(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "network_timeout";
            case SpeechRecognizer.ERROR_NETWORK: return "network";
            case SpeechRecognizer.ERROR_AUDIO: return "audio";
            case SpeechRecognizer.ERROR_SERVER: return "server";
            case SpeechRecognizer.ERROR_CLIENT: return "client_error";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "speech_timeout";
            case SpeechRecognizer.ERROR_NO_MATCH: return "no_match";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "recognizer_busy";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "insufficient_permissions";
            default: return "unknown_" + code;
        }
    }

    // ---------- Plugin methods ----------

    @PluginMethod
    public void available(PluginCall call) {
        boolean ok;
        try {
            ok = SpeechRecognizer.isRecognitionAvailable(getContext());
        } catch (Throwable t) {
            Log.w(TAG, "isRecognitionAvailable threw", t);
            ok = false;
        }
        JSObject ret = new JSObject();
        ret.put("available", ok);
        call.resolve(ret);
    }

    private String mapPermState(PermissionState ps) {
        if (ps == PermissionState.GRANTED) return "granted";
        if (ps == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        PermissionState ps = getPermissionState("microphone");
        JSObject ret = new JSObject();
        ret.put("speechRecognition", mapPermState(ps));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("speechRecognition", "granted");
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("microphone", call, "onMicPermissionResult");
    }

    @PermissionCallback
    private void onMicPermissionResult(PluginCall call) {
        PermissionState ps = getPermissionState("microphone");
        JSObject ret = new JSObject();
        ret.put("speechRecognition", mapPermState(ps));
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        logThread("start() ENTRY");

        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Missing RECORD_AUDIO permission");
            return;
        }

        final String language = call.getString("language", Locale.getDefault().toLanguageTag());
        final boolean partial = Boolean.TRUE.equals(call.getBoolean("partialResults", true));
        partialResultsEnabled = partial;

        // State guard: if not IDLE, force-destroy and re-check.
        if (state != State.IDLE) {
            Log.w(TAG, "start() while state=" + state + " → force cleanup then recheck");
            runOnMain(() -> {
                forceDestroy();
                mainHandler.postDelayed(() -> {
                    if (state != State.IDLE) {
                        Log.e(TAG, "start() still not IDLE after cleanup, rejecting busy");
                        call.reject("busy");
                        return;
                    }
                    doStart(call, language, partial);
                }, BUSY_RECHECK_DELAY_MS);
            });
            return;
        }

        runOnMain(() -> doStart(call, language, partial));
    }

    private void doStart(PluginCall call, String language, boolean partial) {
        logThread("doStart()");
        try {
            if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                call.reject("SpeechRecognizer not available on this device");
                return;
            }
            state = State.STARTING;
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new Listener());

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial);
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false);
            }

            recognizer.startListening(intent);
            Log.d(TAG, "startListening dispatched (lang=" + language + ", partial=" + partial + ", ts=" + System.currentTimeMillis() + ")");
            call.resolve();
        } catch (Throwable t) {
            Log.e(TAG, "doStart threw", t);
            forceDestroy();
            call.reject("start_failed: " + t.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        logThread("stop() ENTRY");
        runOnMain(() -> {
            if (state == State.IDLE || recognizer == null) {
                Log.d(TAG, "stop() already idle");
                call.resolve();
                emitStopped();
                return;
            }
            state = State.STOPPING;
            try {
                recognizer.cancel();
                Log.d(TAG, "recognizer.cancel() dispatched");
            } catch (Throwable t) {
                Log.w(TAG, "cancel threw", t);
            }
            scheduleForceKill();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        Log.d(TAG, "handleOnDestroy() — force cleanup");
        runOnMain(this::forceDestroy);
        super.handleOnDestroy();
    }

    // ---------- RecognitionListener ----------

    private class Listener implements RecognitionListener {
        @Override
        public void onReadyForSpeech(Bundle params) {
            long now = System.currentTimeMillis();
            Log.d(TAG, "onReadyForSpeech ts=" + now + " state=" + state);
            state = State.LISTENING;
            emitStarted();
        }

        @Override public void onBeginningOfSpeech() { Log.d(TAG, "onBeginningOfSpeech"); }
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {
            Log.d(TAG, "onEndOfSpeech");
        }

        @Override
        public void onError(int error) {
            long now = System.currentTimeMillis();
            String msg = errorMessage(error);
            Log.w(TAG, "onError ts=" + now + " code=" + error + " (" + msg + ")");
            cancelForceKill();
            emitError(error, msg);
            destroyAndReset();
            // Emit stopped after error, on main thread after reset scheduled.
            runOnMain(ScripicSTTPlugin.this::emitStopped);
        }

        @Override
        public void onResults(Bundle results) {
            long now = System.currentTimeMillis();
            String msg = errorMessage(results);
            Log.d(TAG, "onResults ts=" + now + " code=" + results + " (" + msg + ")");
            ArrayList<String> matches = results != null
                    ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    : null;
            emitPartial(matches);
            destroyAndReset();
            runOnMain(ScripicSTTPlugin.this::emitStopped);
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            long now = System.currentTimeMillis();
            if (!partialResultsEnabled) return;
            ArrayList<String> matches = partialResults != null
                    ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    : null;
            Log.d(TAG, "onPartialResults ts=" + now + " len=" + (matches != null ? matches.size() : 0));
            emitPartial(matches);
        }

        @Override public void onEvent(int eventType, Bundle params) {}
    }
}
